const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth.config');
const FileLogger = require('../file-logger');
const logger = new FileLogger('orders.log');
const QuickOrder = require('../models/quick-order.model');
const Listing = require('../models/listing.model');
const { send: sendMail } = require('../utils/mailer');

function getUserId(req) {
  try {
    if (req.user && (req.user.id || req.user._id)) return req.user.id || req.user._id;
    const tokenFromCookie = req.cookies && req.cookies.token;
    const authHeader = req.headers && req.headers.authorization;
    const rawToken = tokenFromCookie || (authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) : null);
    if (rawToken) {
      const decoded = jwt.verify(rawToken, (authConfig && authConfig.secret) || process.env.JWT_SECRET);
      if (decoded && decoded.id) return decoded.id;
    }
  } catch (_) {}
  return null;
}

exports.quickCheckout = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { contact, items, total } = req.body || {};


    // Basic validation
    if (!contact || typeof contact !== 'object') {
      return res.status(400).json({ success: false, message: 'Missing contact info' });
    }
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Missing items array' });
    }

    const name = String(contact.name || '').trim();
    const email = String(contact.email || '').trim();
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Normalize items and compute totals
    const normalizedItems = (items || []).map(it => {
      const pieces = Number(it.pieces || 0) || 0;
      const unitPrice = Number(it.unitPrice || 0) || 0;
      const lineTotal = Math.max(0, pieces * unitPrice);
      return {
        listingId: it.listingId || undefined,
        title: it.title || 'Listing',
        pieces,
        unitPrice,
        lineTotal
      };
    });
    const computedTotal = normalizedItems.reduce((sum, it) => sum + (Number(it.lineTotal)||0), 0);
    const finalTotal = Number.isFinite(Number(total)) ? Number(total) : computedTotal;

    // Persist to MongoDB
    const doc = await QuickOrder.create({
      user: userId || undefined,
      contact: { name, email, phone: contact.phone || '', street: contact.street || '', city: contact.city || '', state: contact.state || '', zip: contact.zip || '' },
      items: normalizedItems,
      total: finalTotal,
      status: 'submitted'
    });

    // Log to file for operational trace
    try {
      logger.log('QUICK_ORDER_SAVED', JSON.stringify({ id: String(doc._id), userId, when: new Date().toISOString(), total: finalTotal }));
    } catch (_) {}

    // Fire-and-forget email notifications (buyer + sellers)
    (async () => {
      try {
        // Buyer email
        if (email) {
          const itemsLines = normalizedItems.map(it => `• ${it.title} × ${it.pieces} — $${(it.lineTotal||0).toFixed(2)}`).join('\n');
          const text = [
            `Thank you for your order, ${name || 'FreshShare member'}!`,
            `Order ID: ${String(doc._id)}`,
            `Total: $${(finalTotal||0).toFixed(2)}`,
            '',
            'Items:',
            itemsLines,
            '',
            'We will coordinate pickup details with the seller(s).'
          ].join('\n');
          await sendMail({ to: email, subject: 'FreshShare: Order Confirmation', text, html: `<pre>${text}</pre>` });
        }

        // Seller notifications (unique sellers from listings)
        try {
          const Listing = require('../models/listing.model');
          const User = require('../models/user.model');
          const listingIds = normalizedItems.map(i => i.listingId).filter(Boolean);
          if (listingIds.length) {
            const listings = await Listing.find({ _id: { $in: listingIds } }).select('title seller').lean();
            const sellerIds = Array.from(new Set(listings.map(l => String(l.seller)).filter(Boolean)));
            if (sellerIds.length) {
              const sellers = await User.find({ _id: { $in: sellerIds } }).select('email username').lean();
              const sellerMap = new Map(sellers.map(s => [String(s._id), s]));
              const perSellerItems = new Map();
              listings.forEach(l => {
                const sid = String(l.seller);
                const itemMatches = normalizedItems.filter(i => String(i.listingId||'') === String(l._id));
                if (itemMatches.length) {
                  if (!perSellerItems.has(sid)) perSellerItems.set(sid, []);
                  perSellerItems.get(sid).push(...itemMatches.map(i => ({ title: i.title, pieces: i.pieces, lineTotal: i.lineTotal })));
                }
              });
              await Promise.allSettled(Array.from(perSellerItems.entries()).map(async ([sid, items]) => {
                const seller = sellerMap.get(sid);
                if (!seller || !seller.email) return;
                const itemsLines = items.map(it => `• ${it.title} × ${it.pieces} — $${(it.lineTotal||0).toFixed(2)}`).join('\n');
                const text = [
                  `New FreshShare order from ${name || 'a buyer'}`,
                  `Order ID: ${String(doc._id)}`,
                  `Buyer: ${name || ''} <${email || ''}>${contact.phone ? ' | ' + contact.phone : ''}`,
                  '',
                  'Items reserved from your listing(s):',
                  itemsLines,
                  '',
                  'Please coordinate pickup with the buyer as needed.'
                ].join('\n');
                await sendMail({ to: seller.email, subject: 'FreshShare: New Order', text, html: `<pre>${text}</pre>` });
              }));
            }
          }
        } catch (_) {}
      } catch (e) {
        try { logger.error('QUICK_ORDER_EMAIL_ERROR', String(e && e.message || e)); } catch(_) {}
      }
    })();

    return res.status(201).json({ success: true, orderId: String(doc._id) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Checkout failed' });
  }
};

/**
 * Recreate per-piece reservations from a past QuickOrder.
 * For each item with a valid listingId and pieces > 0, set the user's pieces
 * using the same capping logic as pieceSet: respecting remaining and case size.
 */
exports.reorderFromPast = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const orderId = req.params.id;
    const order = await QuickOrder.findById(orderId).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.user && String(order.user) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'You are not allowed to reorder this purchase' });
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const results = [];
    let totalReserved = 0;

    for (const it of items) {
      try {
        const listingId = it.listingId;
        const requested = Number(it.pieces || 0) || 0;
        if (!listingId || requested <= 0) {
          results.push({ listingId: listingId ? String(listingId) : null, title: it.title || 'Listing', requestedPieces: requested, reservedPieces: 0, status: 'skipped' });
          continue;
        }
        const listing = await Listing.findById(listingId);
        if (!listing) {
          results.push({ listingId: String(listingId), title: it.title || 'Listing', requestedPieces: requested, reservedPieces: 0, status: 'missing' });
          continue;
        }
        let po = listing.pieceOrdering || {};
        let cs = Number(listing.caseSize || 0);
        if (!po.enabled) {
          if (!(cs > 0)) cs = 1; // default minimal case size if missing
          if (cs > 0) {
            listing.caseSize = cs;
            po = {
              enabled: true,
              currentCaseNumber: 1,
              currentCaseRemaining: cs,
              casesFulfilled: 0,
              reservations: []
            };
          } else {
            results.push({ listingId: String(listing._id), title: listing.title, requestedPieces: requested, reservedPieces: 0, status: 'po-disabled' });
            continue;
          }
        }
        if (typeof listing.caseSize !== 'number' || listing.caseSize < 1) {
          results.push({ listingId: String(listing._id), title: listing.title, requestedPieces: requested, reservedPieces: 0, status: 'invalid-case-size' });
          continue;
        }
        if (!Array.isArray(po.reservations)) po.reservations = [];
        if (typeof po.currentCaseNumber !== 'number' || po.currentCaseNumber < 1) po.currentCaseNumber = 1;
        if (typeof po.currentCaseRemaining !== 'number') po.currentCaseRemaining = listing.caseSize;

        const currentCase = po.currentCaseNumber;
        const idx = po.reservations.findIndex(x => String(x.user) === String(userId) && x.status === 'filling' && x.caseNumber === currentCase);
        const prev = idx >= 0 ? Number(po.reservations[idx].pieces || 0) : 0;

        const maxAllowed = listing.caseSize;
        let desired = Math.min(requested, maxAllowed);
        const maxAbsolute = prev + po.currentCaseRemaining;
        if (desired > maxAbsolute) desired = maxAbsolute;
        const delta = desired - prev;
        po.currentCaseRemaining = Math.max(0, po.currentCaseRemaining - Math.max(0, delta));
        if (idx >= 0) {
          po.reservations[idx].pieces = desired;
        } else {
          po.reservations.push({ user: userId, caseNumber: currentCase, pieces: desired, status: 'filling', reservedAt: new Date() });
        }

        // Close case when full
        if (po.currentCaseRemaining === 0) {
          po.reservations = po.reservations.map(r => {
            if (Number(r.caseNumber || 0) === currentCase && r.status === 'filling') {
              const base = (r && typeof r.toObject === 'function') ? r.toObject() : r || {};
              return { ...base, status: 'fulfilled' };
            }
            return r;
          });
          po.casesFulfilled = Number(po.casesFulfilled || 0) + 1;
          po.currentCaseNumber = currentCase + 1;
          po.currentCaseRemaining = Number(listing.caseSize);
        }

        await Listing.updateOne({ _id: listing._id }, { $set: { pieceOrdering: po } });
        totalReserved += Math.max(0, desired);
        results.push({ listingId: String(listing._id), title: listing.title, requestedPieces: requested, reservedPieces: desired, status: 'ok' });
      } catch (e) {
        results.push({ listingId: it && it.listingId ? String(it.listingId) : null, title: it && it.title || 'Listing', requestedPieces: Number(it && it.pieces || 0), reservedPieces: 0, status: 'error', error: String(e && e.message || e) });
      }
    }

    return res.status(200).json({ success: true, data: { totalReserved, items: results } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Reorder failed' });
  }
};
