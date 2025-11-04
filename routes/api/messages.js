const express = require('express');
const router = express.Router();
const Message = require('../../models/message.model');
const User = require('../../models/user.model');
const { body, query, param, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const authConfig = require('../../config/auth.config');

// Simple in-memory rate limiter (per-process, resets on restart)
function createRateLimiter({ windowMs, limit, keyFn }) {
  const buckets = new Map(); // key -> { count, resetAt }
  return function rateLimit(req, res, next) {
    try {
      const now = Date.now();
      const key = (keyFn && keyFn(req)) || (req.ip || 'anon');
      const rec = buckets.get(key);
      if (!rec || rec.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }
      if (rec.count < limit) {
        rec.count++;
        return next();
      }
      const retryMs = Math.max(0, rec.resetAt - now);
      res.setHeader('Retry-After', Math.ceil(retryMs / 1000));
      return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
    } catch (_) {
      return next();
    }
  };
}

function getUserId(req) {
  if (req.user && (req.user.id || req.user._id)) return String(req.user.id || req.user._id);
  if (req.userId) return String(req.userId);
  try {
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

// GET /api/messages
// List messages for the authenticated user with pagination
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * limit;

    const filter = { recipient: userId };
    const total = await Message.countDocuments(filter);
    const messages = await Message.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'username profileImage')
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        messages,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to list messages', error: e.message });
  }
});

// GET /api/messages/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const count = await Message.countDocuments({ recipient: userId, read: false });
    return res.status(200).json({ success: true, data: { count } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to get unread count', error: e.message });
  }
});

// PATCH /api/messages/:id/read  { read: true|false }
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e=>e.msg||(`${e.param}: ${e.msg}`)) });
  next();
};

router.patch(
  '/:id/read',
  express.json(),
  [
    param('id').isString().trim().notEmpty(),
    body('read').optional().isBoolean()
  ],
  handleValidation,
  async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const id = req.params.id;
    const desired = typeof req.body.read === 'boolean' ? req.body.read : true;

    const msg = await Message.findOne({ _id: id, recipient: userId });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    msg.read = desired;
    await msg.save();
    return res.status(200).json({ success: true, data: { id: String(msg._id), read: msg.read } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to update message read status', error: e.message });
  }
});

// PATCH /api/messages/mark-all-read
// Apply rate limiting to mark-all-read to avoid abuse
router.patch('/mark-all-read',
  createRateLimiter({ windowMs: 60 * 1000, limit: 6, keyFn: (req) => getUserId(req) || req.ip }),
  express.json(),
  [ body('olderThan').optional().isISO8601() ],
  handleValidation,
  async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const olderThan = req.body && req.body.olderThan ? new Date(req.body.olderThan) : null;

    const filter = { recipient: userId, read: false };
    if (olderThan && !isNaN(olderThan.getTime())) {
      filter.timestamp = { $lte: olderThan };
    }

    const result = await Message.updateMany(filter, { $set: { read: true } });
    return res.status(200).json({ success: true, data: { matched: result.matchedCount || result.n, modified: result.modifiedCount || result.nModified } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to mark messages as read', error: e.message });
  }
});

// POST /api/messages  { recipientUsername?: string, recipientId?: string, content: string }
router.post(
  '/',
  createRateLimiter({ windowMs: 60 * 1000, limit: 12, keyFn: (req) => getUserId(req) || req.ip }),
  express.json(),
  [
    body('content').isString().trim().isLength({ min: 1, max: 2000 }),
    body('recipientId').optional().isString().trim().notEmpty(),
    body('recipientUsername').optional().isString().trim().isLength({ min: 3 })
  ],
  handleValidation,
  async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const body = req.body || {};
    const contentRaw = (body.content || '').toString();
    const content = contentRaw.trim();
    if (!content) return res.status(400).json({ success: false, message: 'Content is required' });
    if (content.length > 2000) return res.status(400).json({ success: false, message: 'Content too long (max 2000 chars)' });

    let recipient = null;
    if (body.recipientId) {
      try { recipient = await User.findById(body.recipientId).select('_id username'); } catch(_) {}
    } else if (body.recipientUsername) {
      recipient = await User.findOne({ username: body.recipientUsername }).select('_id username');
    }
    if (!recipient) return res.status(404).json({ success: false, message: 'Recipient not found' });
    if (String(recipient._id) === String(userId)) return res.status(400).json({ success: false, message: 'Cannot send a message to yourself' });

    const doc = await Message.create({ sender: userId, recipient: recipient._id, content, timestamp: new Date(), read: false });
    const populated = await Message.findById(doc._id).populate('sender', 'username profileImage').lean();
    return res.status(201).json({ success: true, data: populated });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to send message', error: e.message });
  }
});

module.exports = router;
