const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const os = require('os');
const User = require('../../models/user.model');
const Listing = require('../../models/listing.model');
const QuickOrder = require('../../models/quick-order.model');
const Message = require('../../models/message.model');
const Vendor = require('../../models/vendor.model');
const Role = require('../../models/role.model');
const authConfig = require('../../config/auth.config');
const FileLogger = require('../../file-logger');
const adminLogger = new FileLogger('admin-actions.log');
const fs = require('fs');
const path = require('path');

function getUserId(req) {
  if (req.user && (req.user.id || req.user._id)) return String(req.user.id || req.user._id);
  if (req.userId) return String(req.userId);
  try {
    const tokenFromCookie = req.cookies && req.cookies.token;
    const authHeader = req.headers && req.headers.authorization;
    const rawToken = tokenFromCookie || (authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) : null);
    if (rawToken) {
      const decoded = jwt.verify(rawToken, authConfig.secret);
      if (decoded && decoded.id) return String(decoded.id);
    }
  } catch (_) {}
  return null;
}

let ADMIN_ROLE_ID = null;
async function isAdminUser(user) {
  try {
    if (!user) return false;
    if (!ADMIN_ROLE_ID) {
      const r = await Role.findOne({ name: 'admin' }).select('_id').lean();
      ADMIN_ROLE_ID = r ? String(r._id) : null;
    }
    if (!ADMIN_ROLE_ID) return false;
    const roles = Array.isArray(user.roles) ? user.roles.map(String) : [];
    return roles.includes(ADMIN_ROLE_ID);
  } catch (_) { return false; }
}

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const user = await User.findById(uid).select('roles').lean();
    if (!(await isAdminUser(user))) return res.status(403).json({ success: false, message: 'Forbidden' });

    const [users, listings, orders, messages, vendors] = await Promise.all([
      User.estimatedDocumentCount(),
      Listing.estimatedDocumentCount(),
      QuickOrder.estimatedDocumentCount(),
      Message.estimatedDocumentCount(),
      Vendor.estimatedDocumentCount()
    ]);

    return res.status(200).json({ success: true, data: { users, listings, orders, messages, vendors } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to fetch admin stats', error: e.message });
  }
});

// GET /api/admin/system - application/runtime health snapshot
router.get('/system', async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const me = await User.findById(uid).select('roles').lean();
    if (!(await isAdminUser(me))) return res.status(403).json({ success: false, message: 'Forbidden' });

    const state = mongoose.connection.readyState;
    const stateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    let pingOk = false;
    let pingMs = null;
    if (state === 1) {
      const started = Date.now();
      try {
        await mongoose.connection.db.admin().ping();
        pingOk = true;
        pingMs = Date.now() - started;
      } catch (err) {
        pingOk = false;
        pingMs = Date.now() - started;
      }
    }

    const memory = process.memoryUsage();
    const loadAvg = os.loadavg ? os.loadavg() : [];

    return res.status(200).json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        db: {
          connected: state === 1,
          state: stateMap[state] || String(state),
          pingMs,
          pingOk
        },
        node: {
          uptimeSeconds: Math.floor(process.uptime()),
          memory: {
            rss: memory.rss,
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal
          },
          loadAverage: loadAvg
        },
        api: {
          endpoint: '/api',
          documented: true
        }
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to load system status', error: e.message });
  }
});
 
// List users with search and pagination (admin only)
router.get('/users', async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const me = await User.findById(uid).select('roles').lean();
    if (!(await isAdminUser(me))) return res.status(403).json({ success: false, message: 'Forbidden' });

    const q = (req.query.q || '').toString().trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [ { username: rx }, { email: rx } ];
    }

    const [total, rows] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('username email createdAt lastLogin roles')
        .populate('roles', 'name')
        .lean()
    ]);

    const users = rows.map(u => ({
      id: String(u._id),
      username: u.username,
      email: u.email,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin || null,
      roles: Array.isArray(u.roles) ? u.roles.map(r => r && r.name).filter(Boolean) : []
    }));

    return res.status(200).json({ success: true, data: { users, pagination: { total, page, limit, pages: Math.ceil(total / limit) } } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to list users', error: e.message });
  }
});

// GET /api/admin/users/:id/overview - read-only snapshot for impersonation view mode
router.get('/users/:id/overview', async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const me = await User.findById(uid).select('roles').lean();
    if (!(await isAdminUser(me))) return res.status(403).json({ success: false, message: 'Forbidden' });

    const targetId = req.params.id;
    const target = await User.findById(targetId).select('username email createdAt lastLogin roles').populate('roles','name').lean();
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    const [listingsCount, ordersCount, unreadCount, recentOrders, recentMessages] = await Promise.all([
      Listing.countDocuments({ seller: targetId }),
      QuickOrder.countDocuments({ user: targetId }),
      Message.countDocuments({ recipient: targetId, read: false }),
      QuickOrder.find({ user: targetId }).sort({ createdAt: -1 }).limit(5).select('createdAt total items').lean(),
      Message.find({ $or: [ { recipient: targetId }, { sender: targetId } ] })
        .sort({ timestamp: -1 }).limit(5)
        .select('timestamp read sender recipient')
        .populate('sender','username')
        .populate('recipient','username')
        .lean()
    ]);

    const payload = {
      user: {
        id: String(target._id),
        username: target.username,
        email: target.email,
        createdAt: target.createdAt,
        lastLogin: target.lastLogin || null,
        roles: Array.isArray(target.roles) ? target.roles.map(r => r && r.name).filter(Boolean) : []
      },
      counts: { listings: listingsCount, orders: ordersCount, unreadMessages: unreadCount },
      recentOrders: recentOrders.map(o => ({ id: String(o._id), createdAt: o.createdAt, total: o.total, items: Array.isArray(o.items) ? o.items.length : 0 })),
      recentMessages: recentMessages.map(m => ({
        id: String(m._id),
        at: m.timestamp,
        read: !!m.read,
        sender: m.sender && m.sender.username ? m.sender.username : String(m.sender),
        recipient: m.recipient && m.recipient.username ? m.recipient.username : String(m.recipient)
      }))
    };

    try { adminLogger.info('ADMIN_ACTION', { actor: uid, action: 'view_as', target: String(targetId) }); } catch(_) {}
    return res.status(200).json({ success: true, data: payload });
  } catch (e) {
    try { adminLogger.error('ADMIN_ACTION_ERROR view_as', String(e && e.message || e)); } catch(_) {}
    return res.status(500).json({ success: false, message: 'Failed to fetch user overview', error: e.message });
  }
});

// Grant admin role to a user (admin only)
router.post('/users/:id/roles/admin/grant', async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const me = await User.findById(uid).select('roles').lean();
    if (!(await isAdminUser(me))) return res.status(403).json({ success: false, message: 'Forbidden' });

    const targetId = req.params.id;
    const role = await Role.findOne({ name: 'admin' }).select('_id').lean();
    if (!role) return res.status(500).json({ success: false, message: 'Admin role not configured' });
    const rid = String(role._id);

    const user = await User.findById(targetId).select('roles username email').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const current = Array.isArray(user.roles) ? user.roles.map(String) : [];
    if (!current.includes(rid)) {
      await User.updateOne({ _id: user._id }, { $addToSet: { roles: role._id } });
    }
    const updated = await User.findById(targetId).select('roles').populate('roles', 'name').lean();
    try { adminLogger.log('ADMIN_ACTION', { actor: uid, action: 'grant_admin', target: String(targetId), resultRoles: (updated.roles||[]).map(r => r && r.name).filter(Boolean) }); } catch(_) {}
    return res.status(200).json({ success: true, data: { roles: (updated.roles||[]).map(r => r && r.name).filter(Boolean) } });
  } catch (e) {
    try { adminLogger.error('ADMIN_ACTION_ERROR grant_admin', String(e && e.message || e)); } catch(_) {}
    return res.status(500).json({ success: false, message: 'Failed to grant admin', error: e.message });
  }
});

// Revoke admin role from a user (admin only)
router.post('/users/:id/roles/admin/revoke', async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const me = await User.findById(uid).select('roles').lean();
    if (!(await isAdminUser(me))) return res.status(403).json({ success: false, message: 'Forbidden' });

    const targetId = req.params.id;
    if (String(targetId) === String(uid)) {
      return res.status(400).json({ success: false, message: 'You cannot revoke your own admin role' });
    }
    const role = await Role.findOne({ name: 'admin' }).select('_id').lean();
    if (!role) return res.status(500).json({ success: false, message: 'Admin role not configured' });

    // Last-admin guard: prevent removing the final admin
    const adminCount = await User.countDocuments({ roles: role._id });
    if (adminCount <= 1) {
      return res.status(400).json({ success: false, message: 'Cannot revoke the last remaining admin' });
    }

    await User.updateOne({ _id: targetId }, { $pull: { roles: role._id } });
    const updated = await User.findById(targetId).select('roles').populate('roles', 'name').lean();
    try { adminLogger.log('ADMIN_ACTION', { actor: uid, action: 'revoke_admin', target: String(targetId), resultRoles: (updated.roles||[]).map(r => r && r.name).filter(Boolean) }); } catch(_) {}
    return res.status(200).json({ success: true, data: { roles: (updated.roles||[]).map(r => r && r.name).filter(Boolean) } });
  } catch (e) {
    try { adminLogger.error('ADMIN_ACTION_ERROR revoke_admin', String(e && e.message || e)); } catch(_) {}
    return res.status(500).json({ success: false, message: 'Failed to revoke admin', error: e.message });
  }
});

// GET /api/admin/audit - recent admin actions
router.get('/audit', async (req, res) => {
  try {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const me = await User.findById(uid).select('roles').lean();
    if (!(await isAdminUser(me))) return res.status(403).json({ success: false, message: 'Forbidden' });

    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 100));
    const logPath = path.join(__dirname, '../../logs/admin-actions.log');
    let content = '';
    try {
      const stat = fs.statSync(logPath);
      const maxBytes = 512 * 1024; // last 512KB
      const start = Math.max(0, stat.size - maxBytes);
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      content = buf.toString('utf8');
    } catch (e) {
      // file may not exist yet
      content = '';
    }

    const lines = content.split(/\r?\n/).filter(Boolean).reverse();
    const entries = [];
    for (const line of lines) {
      if (entries.length >= limit) break;
      // Example: [2025-09-21T..Z] INFO: ADMIN_ACTION {json}
      const m = line.match(/^\[(.*?)\]\s+(INFO|ERROR):\s+(ADMIN_ACTION(?:_ERROR)?)\s+(.*)$/);
      if (!m) { entries.push({ raw: line }); continue; }
      const ts = m[1]; const level = m[2]; const actionTag = m[3]; const rest = m[4];
      let payload = null; try { payload = JSON.parse(rest); } catch(_) {}
      entries.push({ timestamp: ts, level, action: actionTag, payload, raw: line });
    }

    return res.status(200).json({ success: true, data: { entries } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to read audit log', error: e.message });
  }
});

module.exports = router;
