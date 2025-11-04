const express = require('express');
const router = express.Router();

// Models
const QuickOrder = require('../../models/quick-order.model');
const Message = require('../../models/message.model');

// Utility: safe get user id
function getUserId(req) {
  if (req.user && (req.user.id || req.user._id)) return String(req.user.id || req.user._id);
  if (req.userId) return String(req.userId);
  try {
    const jwt = require('jsonwebtoken');
    const authConfig = require('../../config/auth.config');
    const tokenFromCookie = req.cookies && req.cookies.token;
    const authHeader = req.headers && req.headers.authorization;
    const rawToken = tokenFromCookie || (authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) : null);
    if (rawToken) {
      const decoded = jwt.verify(rawToken, (authConfig && authConfig.secret) || process.env.JWT_SECRET);
      if (decoded && decoded.id) return String(decoded.id);
    }
  } catch (_) {}
  return null;
}

// GET /api/dashboard
// Returns summary data for the user's dashboard
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Recent orders (limit 5)
    let orders = [];
    try {
      orders = await QuickOrder.find({ user: userId }).sort({ createdAt: -1 }).limit(5).lean();
    } catch (e) {
      orders = [];
    }

    const recentOrders = (orders || []).map(o => ({
      id: String(o._id),
      orderNumber: String(o._id).slice(-6).toUpperCase(),
      date: o.createdAt || new Date(),
      groupName: 'Local Pickup',
      items: Array.isArray(o.items) ? o.items.reduce((s, it) => s + (Number(it.pieces || 0) || 0), 0) : 0,
      total: Number(o.total || 0)
    }));

    // Upcoming deliveries – placeholder derived from recent orders (none scheduled system yet)
    const upcomingDeliveries = [];

    // Messages: latest 5 to the authenticated user
    let messages = [];
    try {
      messages = await Message.find({ recipient: userId })
        .sort({ timestamp: -1 })
        .limit(5)
        .populate('sender', 'username profileImage')
        .lean();
    } catch (e) {
      messages = [];
    }

    // Events – optional; handled by calendar endpoint
    const events = [];

    return res.status(200).json({
      success: true,
      data: {
        recentOrders,
        upcomingDeliveries,
        events,
        messages
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load dashboard', error: error.message });
  }
});

// GET /api/dashboard/calendar?month=MM&year=YYYY
// Returns calendar events for the given month/year
router.get('/calendar', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const m = parseInt(req.query.month, 10); // 0-11
    const y = parseInt(req.query.year, 10);
    if (Number.isNaN(m) || Number.isNaN(y)) {
      return res.status(400).json({ success: false, message: 'Invalid month/year' });
    }

    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 1, 0, 0, 0, 0);

    let orders = [];
    try {
      orders = await QuickOrder.find({ user: userId, createdAt: { $gte: start, $lt: end } }).select('createdAt total').lean();
    } catch (_) {}

    // Represent orders as delivery-type events on their createdAt date
    const events = (orders || []).map(o => ({
      type: 'delivery',
      date: o.createdAt,
      title: 'Order placed',
      description: `Total $${Number(o.total || 0).toFixed(2)}`
    }));

    // Include first reservation per listing per day within the month window
    try {
      const Listing = require('../../models/listing.model');
      const resvListings = await Listing.find({
        'pieceOrdering.enabled': true,
        'pieceOrdering.reservations': {
          $elemMatch: {
            user: userId,
            reservedAt: { $gte: start, $lt: end }
          }
        }
      }).select('title pieceOrdering');

      resvListings.forEach(lst => {
        const po = lst.pieceOrdering || {};
        const byDayKey = new Set();
        (po.reservations || [])
          .filter(r => String(r.user) === String(userId) && r.reservedAt && (new Date(r.reservedAt) >= start) && (new Date(r.reservedAt) < end))
          .sort((a, b) => new Date(a.reservedAt) - new Date(b.reservedAt))
          .forEach(r => {
            const d = new Date(r.reservedAt);
            const key = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate() + '-' + String(lst._id);
            if (byDayKey.has(key)) return;
            byDayKey.add(key);
            events.push({
              type: 'reservation',
              date: r.reservedAt,
              title: 'Pieces reserved',
              description: `${lst.title} — ${Number(r.pieces||0)} pcs`
            });
          });
      });
    } catch (_) {}

    return res.status(200).json({ success: true, data: { events } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load calendar', error: error.message });
  }
});

module.exports = router;
