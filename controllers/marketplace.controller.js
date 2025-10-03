const db = require('../models');
const Listing = db.listing;
const Vendor = db.vendor;
const User = db.user;
const Group = db.group;
const authConfig = require('../config/auth.config');
const usdaApi = require('../utils/usdaApi');
const jwt = require('jsonwebtoken');
const https = require('https');
const FileLogger = require('../file-logger');
const upcLogger = new FileLogger('upc-lookup.log');

// Helper to extract user ID from request (JWT or req.user)
function getUserId(req) {
  if (req.user && (req.user.id || req.user._id)) return req.user.id || req.user._id;
  const primarySecret = (authConfig && authConfig.secret)
    || process.env.JWT_SECRET
    || 'bezkoder-secret-key';
  const legacySecret = process.env.LEGACY_JWT_SECRET || 'freshShare-auth-secret';

  const maskToken = (token) => {
    if (!token || typeof token !== 'string') return '(none)';
    if (token.length <= 12) return token;
    return `${token.slice(0, 6)}…${token.slice(-6)}`;
  };

  const decodeWithSecrets = (token) => {
    if (!token) return null;
    try {
      return jwt.verify(token, primarySecret);
    } catch (primaryErr) {
      try {
        return jwt.verify(token, legacySecret);
      } catch (legacyErr) {
        console.warn('[marketplace.getUserId] JWT verification failed for both secrets', {
          primaryError: primaryErr && primaryErr.message,
          legacyError: legacyErr && legacyErr.message,
          tokenPreview: maskToken(token)
        });
        return null;
      }
    }
  };

  try {
    const tokenFromCookie = req.cookies && req.cookies.token;
    const authHeader = req.headers && req.headers.authorization;
    const rawToken = tokenFromCookie
      || (authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) : null);

    try {
      console.log('[marketplace.getUserId] token candidates', {
        cookie: maskToken(tokenFromCookie),
        header: maskToken(authHeader),
        chosen: maskToken(rawToken)
      });
    } catch (_) {}

    const decoded = decodeWithSecrets(rawToken);
    if (decoded && decoded.id) return decoded.id;
    console.warn('[marketplace.getUserId] Failed to decode token to user ID', {
      tokenPreview: maskToken(rawToken)
    });
  } catch (e) {
    console.warn('[marketplace.getUserId] Unexpected error while extracting user ID', e && e.message);
  }

  return null;
}

// ===== Vendors CRUD =====
exports.getMyVendors = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const vendors = await Vendor.find({ owner: userId }).sort({ name: 1 }).lean();
    return res.status(200).json({ success: true, data: vendors });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to load vendors', error: e.message });
  }
};

exports.createVendor = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const b = req.body || {};
    const name = (b.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Vendor name is required' });
    const website = normalizeUrl(b.website);
    const doc = await Vendor.create({
      owner: userId,
      name,
      contactEmail: (b.contactEmail || '').trim() || undefined,
      contactPhone: (b.contactPhone || '').trim() || undefined,
      website: website || undefined,
      notes: (b.notes || '').trim() || undefined,
      address: (b.address || '').trim() || undefined,
      city: (b.city || '').trim() || undefined,
      state: (b.state || '').trim() || undefined,
      zipCode: (b.zipCode || '').trim() || undefined,
      coordinates: (b.lat && b.lng) ? { type: 'Point', coordinates: [Number(b.lng), Number(b.lat)] } : undefined
    });
    return res.status(201).json({ success: true, data: doc });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to create vendor', error: e.message });
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const id = req.params.id;
    const v = await Vendor.findOne({ _id: id, owner: userId });
    if (!v) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const b = req.body || {};
    const website = normalizeUrl(b.website);
    const updates = {
      ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
      ...(b.contactEmail !== undefined ? { contactEmail: String(b.contactEmail).trim() } : {}),
      ...(b.contactPhone !== undefined ? { contactPhone: String(b.contactPhone).trim() } : {}),
      ...(b.website !== undefined ? { website: website || undefined } : {}),
      ...(b.notes !== undefined ? { notes: String(b.notes).trim() } : {}),
      ...(b.address !== undefined ? { address: String(b.address).trim() } : {}),
      ...(b.city !== undefined ? { city: String(b.city).trim() } : {}),
      ...(b.state !== undefined ? { state: String(b.state).trim() } : {}),
      ...(b.zipCode !== undefined ? { zipCode: String(b.zipCode).trim() } : {}),
    };
    if (b.lat !== undefined && b.lng !== undefined) {
      const lat = Number(b.lat), lng = Number(b.lng);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        updates.coordinates = { type: 'Point', coordinates: [lng, lat] };
      } else {
        updates.coordinates = undefined;
      }
    }
    await Vendor.updateOne({ _id: id }, { $set: updates });
    const updated = await Vendor.findById(id).lean();
    return res.status(200).json({ success: true, data: updated });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to update vendor', error: e.message });
  }
};

exports.deleteVendor = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const id = req.params.id;
    const v = await Vendor.findOne({ _id: id, owner: userId });
    if (!v) return res.status(404).json({ success: false, message: 'Vendor not found' });
    await Vendor.deleteOne({ _id: id });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to delete vendor', error: e.message });
  }
};
// --- UPC helpers ---
function digitsOnly(str) { return (str || '').replace(/[^0-9]/g, ''); }
function normalizeUpcCandidates(input) {
  const raw = digitsOnly(input);
  const len = raw.length;
  const out = new Set();
  if (!raw) return [];
  // Base
  out.add(raw);
  // Common variants
  if (len === 12) { out.add('0' + raw); }
  if (len === 13 && raw.startsWith('0')) { out.add(raw.substring(1)); }
  // Return array in insertion order
  return Array.from(out);
}

function httpGetJson(url, headers = {}, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json });
          } catch (e) {
            resolve({ ok: false, status: res.statusCode || 0, data: null, error: 'Invalid JSON' });
          }
        });
      });
      req.on('timeout', () => { try { req.destroy(new Error('Timeout')); } catch(_){} resolve({ ok:false, status:0, data:null, error:'Timeout' }); });
      req.on('error', (err) => { resolve({ ok:false, status:0, data:null, error: String(err && err.message || err) }); });
    } catch (e) { resolve({ ok:false, status:0, data:null, error: String(e && e.message || e) }); }
  });
}

async function tryOpenFoodFacts(code) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
  upcLogger.log('[OFF] GET', url);
  const resp = await httpGetJson(url, { 'Accept': 'application/json' }, 3500);
  if (!resp || !resp.data) { upcLogger.error('[OFF] No response data'); return null; }
  const d = resp.data;
  if (d.status !== 1 || !d.product) { upcLogger.log('[OFF] Not found or status!=1 for', code); return null; }
  const p = d.product;
  const imageUrl = p.image_url || (p.selected_images && p.selected_images.front && p.selected_images.front.display && (p.selected_images.front.display.en || p.selected_images.front.display.en_GB)) || p.image_small_url || null;
  const title = p.product_name || p.generic_name || p.brands_tags && p.brands_tags[0] || `Product (${code})`;
  const brand = p.brands || (Array.isArray(p.brands_tags) && p.brands_tags.join(', ')) || 'Unknown Brand';
  const result = { source: 'openfoodfacts', code, title, brand, imageUrl };
  upcLogger.log('[OFF] Hit:', JSON.stringify(result));
  return result;
}


// Normalize URL to ensure it includes a scheme
function normalizeUrl(url) {
  try {
    if (!url || typeof url !== 'string') return url;
    const trimmed = url.trim();
    if (trimmed === '') return '';
    // If already has a scheme, return as-is
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // If it looks like a domain or path, prefix https://
    return `https://${trimmed}`;
  } catch (_) {
    return url;
  }
}

/**
 * Create a new marketplace listing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.createListing = async (req, res) => {
  try {
    console.log('➡️  createListing called');
    try {
      console.log('Content-Type:', req.headers && req.headers['content-type']);
      console.log('Body keys:', Object.keys(req.body || {}));
      console.log('Sample fields:', {
        title: req.body && req.body.title,
        price: req.body && req.body.price,
        category: req.body && req.body.category,
        caseSize: req.body && req.body.caseSize
      });
      console.log('Files count:', req.files ? req.files.length : 0);
    } catch (logErr) {
      console.error('Logging error in createListing:', logErr);
    }
    // Coerce and sanitize incoming fields (multer + FormData yields strings)
    const body = req.body || {};
    // Support bracket-style keys coming from the form (e.g., location[city])
    const getField = (key, fallback = undefined) => (key in body ? body[key] : fallback);

    // Build location from bracketed fields if present
    const address = getField('location[address]');
    const city = getField('location[city]');
    const state = getField('location[state]');
    const zipCode = getField('location[zipCode]');
    const latStr = getField('location[coordinates][lat]') || getField('latitude');
    const lngStr = getField('location[coordinates][lng]') || getField('longitude');
    const lat = latStr !== undefined ? parseFloat(latStr) : undefined;
    const lng = lngStr !== undefined ? parseFloat(lngStr) : undefined;

    let location;
    if (address || city || state || zipCode || (!Number.isNaN(lat) && !Number.isNaN(lng))) {
      location = {
        address: address || undefined,
        city: city || undefined,
        state: state || undefined,
        zipCode: zipCode || undefined
      };
      if (typeof lat === 'number' && !Number.isNaN(lat) && typeof lng === 'number' && !Number.isNaN(lng)) {
        location.coordinates = {
          type: 'Point',
          coordinates: [lng, lat]
        };
      }
    }

    // Vendor info (optional)
    const vendorName = getField('vendor[name]');
    const vendorEmail = getField('vendor[contactEmail]');
    const vendorPhone = getField('vendor[contactPhone]');
    const vendorWebsite = normalizeUrl(getField('vendor[website]'));
    const vendorNotes = getField('vendor[notes]');
    let vendor;
    if (vendorName || vendorEmail || vendorPhone || vendorWebsite || vendorNotes) {
      vendor = {
        name: vendorName || undefined,
        contactEmail: vendorEmail || undefined,
        contactPhone: vendorPhone || undefined,
        website: vendorWebsite || undefined,
        notes: vendorNotes || undefined
      };
    }
    const vendorIdRaw = getField('vendorId');
    const saveVendorFlag = getField('saveVendor') === 'true' || getField('saveVendor') === true || getField('saveVendor') === 'on';

    // Coerce numeric fields
    let price = body.price !== undefined ? Number(body.price) : undefined;
    let casePrice = body.casePrice !== undefined ? Number(body.casePrice) : undefined;
    const quantity = body.quantity !== undefined ? Number(body.quantity) : undefined;
    const caseSize = body.caseSize !== undefined ? Number(body.caseSize) : undefined;
    const isOrganic = body.isOrganic === 'true' || body.isOrganic === true;
    // If unit is case and casePrice is omitted, use price as casePrice
    const priceUnitNorm = (body.priceUnit || '').toString().toLowerCase();
    if (priceUnitNorm === 'case' && (casePrice === undefined || Number.isNaN(casePrice))) {
      casePrice = price;
    }
    // If unit is not case and caseSize is valid, compute missing values
    if (priceUnitNorm !== 'case' && typeof caseSize === 'number' && !Number.isNaN(caseSize) && caseSize > 0) {
      if ((casePrice === undefined || Number.isNaN(casePrice)) && (typeof price === 'number' && !Number.isNaN(price))) {
        casePrice = Math.round(price * caseSize * 100) / 100;
      } else if ((price === undefined || Number.isNaN(price)) && (typeof casePrice === 'number' && !Number.isNaN(casePrice))) {
        price = Math.round((casePrice / caseSize) * 100) / 100;
      }
    }

    // Group buy fields (supports bracket notation)
    const gbEnabledRaw = getField('groupBuy[enabled]');
    const gbMinCasesRaw = getField('groupBuy[minCases]');
    const gbTargetCasesRaw = getField('groupBuy[targetCases]');
    const gbDeadlineRaw = getField('groupBuy[deadline]');
    const gbEnabled = gbEnabledRaw === 'true' || gbEnabledRaw === true || gbEnabledRaw === 'on' || gbEnabledRaw === '1';
    const gbMinCases = gbMinCasesRaw !== undefined ? Number(gbMinCasesRaw) : undefined;
    const gbTargetCases = gbTargetCasesRaw !== undefined ? Number(gbTargetCasesRaw) : undefined;
    const gbDeadline = gbDeadlineRaw ? new Date(gbDeadlineRaw) : undefined;

    // Piece ordering fields
    const poEnabledRaw = getField('pieceOrdering[enabled]');
    const poEnabled = poEnabledRaw === 'true' || poEnabledRaw === true || poEnabledRaw === 'on' || poEnabledRaw === '1';

    // Normalize tags (may come as a single string or multiple entries)
    let tags = [];
    if (Array.isArray(body.tags)) tags = body.tags;
    else if (typeof body.tags === 'string' && body.tags.trim() !== '') tags = [body.tags];

    // Determine seller from auth if available (reuse shared helper)
    let sellerId = body.userId;
    const authUserId = getUserId(req);
    if (authUserId) sellerId = authUserId;
    if (!sellerId) {
      try {
        const tokenFromCookie = req.cookies && req.cookies.token;
        const authHeader = req.headers && req.headers.authorization;
        const rawToken = tokenFromCookie
          || (authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) : null);
        console.warn('[createListing] Missing sellerId after getUserId', {
          cookie: tokenFromCookie ? `${tokenFromCookie.slice(0, 6)}…${tokenFromCookie.slice(-6)}` : '(none)',
          header: authHeader || '(none)'
        });
      } catch (logErr) {
        console.warn('[createListing] Error while logging missing seller diagnostics', logErr && logErr.message);
      }
    }
    if (!sellerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to create a listing. Please log in.'
      });
    }

    // Basic validation to prevent 500s due to Mongoose required fields
    const errors = [];
    if (!body.title || !body.title.trim()) errors.push('Title is required');
    if (!body.description || !body.description.trim()) errors.push('Description is required');
    if (price === undefined || Number.isNaN(price) || price < 0) errors.push('Price must be a non-negative number');
    if (casePrice !== undefined && (Number.isNaN(casePrice) || casePrice < 0)) errors.push('Case price must be a non-negative number');
    if (!body.category) errors.push('Category is required');
    if (caseSize !== undefined && (Number.isNaN(caseSize) || caseSize < 1)) errors.push('Case size must be at least 1');
    if (gbEnabled) {
      if (gbMinCases !== undefined && (Number.isNaN(gbMinCases) || gbMinCases < 1)) errors.push('Group buy minimum cases must be at least 1');
      if (gbTargetCases !== undefined && (Number.isNaN(gbTargetCases) || gbTargetCases < 1)) errors.push('Group buy target cases must be at least 1');
    }
    if (errors.length) {
      return res.status(400).json({ success: false, message: 'Validation error', errors });
    }

    // If vendorId is provided, try to fetch and snapshot vendor
    let vendorId;
    if (vendorIdRaw) {
      try {
        const fetchedVendor = await Vendor.findOne({ _id: vendorIdRaw, owner: sellerId });
        if (fetchedVendor) {
          vendorId = fetchedVendor._id;
          // Snapshot vendor data if vendor snapshot not already provided
          if (!vendor) {
            vendor = {
              name: fetchedVendor.name,
              contactEmail: fetchedVendor.contactEmail,
              contactPhone: fetchedVendor.contactPhone,
              website: fetchedVendor.website,
              notes: fetchedVendor.notes
            };
          }
        }
      } catch (e) {
        console.warn('Invalid vendorId provided or not found for user');
      }
    }

    // Optionally save vendor from provided fields
    if (!vendorId && saveVendorFlag && vendor && vendor.name) {
      try {
        const newVendor = await Vendor.create({ owner: sellerId, ...vendor });
        vendorId = newVendor._id;
      } catch (e) {
        console.error('Failed to save vendor:', e.message);
      }
    }

    // Determine group for the listing (must belong to an active group of the seller)
    let groupId = getField('groupId') || body.groupId || undefined;
    const userDoc = await User.findById(sellerId).select('groups');
    if (!userDoc) {
      return res.status(401).json({ success: false, message: 'User not found for listing creation' });
    }
    const activeGroupIds = (userDoc.groups || [])
      .filter(m => m && String(m.status) === 'active' && m.group)
      .map(m => String(m.group));
    if (groupId) {
      if (!activeGroupIds.includes(String(groupId))) {
        return res.status(403).json({ success: false, message: 'You can only create listings in a group you belong to' });
      }
    } else {
      if (activeGroupIds.length === 0) {
        return res.status(400).json({ success: false, message: 'You must join a group before creating a listing' });
      }
      groupId = activeGroupIds[0];
    }

    // Create a new listing object
    const listing = new Listing({
      title: body.title,
      description: body.description,
      price,
      casePrice,
      priceUnit: body.priceUnit,
      category: body.category,
      location, // optional; includes GeoJSON only if lat/lng provided
      seller: sellerId,
      group: groupId,
      isOrganic,
      quantity,
      caseSize,
      tags,
      vendor,
      vendorId,
      upcCode: body.upcCode
    });

    // Apply groupBuy if provided
    if (gbEnabled || gbMinCasesRaw !== undefined || gbTargetCasesRaw !== undefined || gbDeadlineRaw !== undefined) {
      listing.groupBuy = {
        enabled: gbEnabled,
        ...(gbMinCases !== undefined ? { minCases: gbMinCases } : {}),
        ...(gbTargetCases !== undefined ? { targetCases: gbTargetCases } : {}),
        ...(gbDeadline ? { deadline: gbDeadline } : {})
      };
    }

    // Initialize piece ordering
    const shouldEnablePO = poEnabled || (typeof caseSize === 'number' && !Number.isNaN(caseSize) && caseSize > 0);
    if (shouldEnablePO) {
      if (typeof caseSize !== 'number' || Number.isNaN(caseSize) || caseSize < 1) {
        return res.status(400).json({ success: false, message: 'Case size must be set to enable per-piece ordering' });
      }
      listing.pieceOrdering = {
        enabled: true,
        currentCaseNumber: 1,
        currentCaseRemaining: caseSize,
        casesFulfilled: 0,
        reservations: []
      };
    }

    // If UPC code is provided, fetch nutritional information
    if (body.upcCode) {
      try {
        const productInfo = await usdaApi.getProductByUpc(body.upcCode);
        if (productInfo.success) {
          listing.nutritionalInfo = {
            fdcId: productInfo.data.fdcId,
            brandName: productInfo.data.brandName,
            ingredients: productInfo.data.ingredients,
            servingSize: productInfo.data.servingSize,
            servingSizeUnit: productInfo.data.servingSizeUnit,
            foodNutrients: productInfo.data.foodNutrients
          };
          // If no title was provided, use the product description
          if (!body.title || body.title.trim() === '') {
            listing.title = productInfo.data.description;
          }
        }
      } catch (upcError) {
        console.error('Error fetching UPC data:', upcError);
        // Continue with listing creation even if UPC lookup fails
      }
    }

    // If images were uploaded, add them to the listing (normalize Windows backslashes)
    if (req.files && req.files.length > 0) {
      listing.images = req.files.map(file => String(file.path || '').replace(/\\/g, '/'));
    } else {
      // Quick path: use imageUrl provided by UPC lookup if present
      try {
        const imageUrl = (body && typeof body.imageUrl === 'string') ? body.imageUrl.trim() : '';
        if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
          listing.images = [imageUrl];
        }
      } catch (_) {}
    }

    // Save the listing to the database
    const savedListing = await listing.save();

    res.status(201).json({
      success: true,
      message: 'Listing created successfully',
      data: savedListing
    });
  } catch (error) {
    console.error('❌ createListing error:', error && error.message);
    console.error('Error name:', error && error.name);
    if (error && error.stack) console.error(error.stack);
    if (error && error.name === 'ValidationError') {
      const errors = Object.values(error.errors || {}).map(e => e.message || String(e));
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create listing',
      error: error.message
    });
  }
};

/**
 * Get all marketplace listings with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getListings = async (req, res) => {
  try {
    const { 
      category, 
      minPrice, 
      maxPrice, 
      isOrganic, 
      sortBy, 
      limit = 10, 
      page = 1,
      search,
      groupId
    } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (category) filter.category = category;
    if (isOrganic) filter.isOrganic = isOrganic === 'true';
    if (groupId) filter.group = groupId;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    
    // Add text search if search parameter is provided
    if (search) {
      filter.$text = { $search: search };
    }
    
    // Build sort object
    let sort = { createdAt: -1 }; // Default sort by newest
    
    if (sortBy === 'price-asc') sort = { price: 1 };
    if (sortBy === 'price-desc') sort = { price: -1 };
    
    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);
    
    // Execute query
    const listings = await Listing.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .populate('seller', 'username profileImage');
    
    // Get total count for pagination
    const total = await Listing.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      data: {
        listings,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch listings",
      error: error.message
    });
  }
};

/**
 * Get a single listing by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getListingById = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate('seller', 'username profileImage');
    
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found"
      });
    }
    
    res.status(200).json({
      success: true,
      data: listing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch listing",
      error: error.message
    });
  }
};

/**
 * Update a listing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found"
      });
    }
    
    // Secure ownership check using authenticated user
    const currentUserId = (req.user && (req.user.id || req.user._id)) || (function(){
      try {
        const tokenFromCookie = req.cookies && req.cookies.token;
        const authHeader = req.headers && req.headers.authorization;
        const rawToken = tokenFromCookie || (authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) : null);
        if (rawToken) {
          const decoded = jwt.verify(rawToken, process.env.JWT_SECRET || 'bezkoder-secret-key');
          if (decoded && decoded.id) return decoded.id;
        }
      } catch (e) {}
      return null;
    })();

    if (!currentUserId || listing.seller.toString() !== String(currentUserId)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this listing"
      });
    }
    
    // Prepare update object
    const body = req.body || {};
    // Normalize numeric fields and apply unit logic
    let priceU = body.price !== undefined ? Number(body.price) : undefined;
    let casePriceU = body.casePrice !== undefined ? Number(body.casePrice) : undefined;
    const puNormU = (body.priceUnit || '').toString().toLowerCase();
    if (puNormU === 'case' && (casePriceU === undefined || Number.isNaN(casePriceU))) {
      casePriceU = priceU;
    }
    const quantityU = body.quantity !== undefined ? Number(body.quantity) : undefined;
    const caseSizeU = body.caseSize !== undefined ? Number(body.caseSize) : undefined;

    const updateData = {
      title: body.title,
      description: body.description,
      price: priceU,
      casePrice: casePriceU,
      priceUnit: body.priceUnit,
      category: body.category,
      location: body.location,
      isOrganic: body.isOrganic,
      isAvailable: body.isAvailable,
      quantity: quantityU,
      caseSize: caseSizeU,
      tags: body.tags,
      updatedAt: Date.now()
    };

    // Handle vendor updates: accept bracketed fields like createListing
    const getField = (key, fallback = undefined) => (key in body ? body[key] : fallback);
    const vendorName = getField('vendor[name]');
    const vendorEmail = getField('vendor[contactEmail]');
    const vendorPhone = getField('vendor[contactPhone]');
    const vendorWebsite = normalizeUrl(getField('vendor[website]'));
    const vendorNotes = getField('vendor[notes]');
    const vendorIdRaw = getField('vendorId');
    const saveVendorFlag = getField('saveVendor') === 'true' || getField('saveVendor') === true || getField('saveVendor') === 'on';

    let vendorSnapshot;
    if (vendorName || vendorEmail || vendorPhone || vendorWebsite || vendorNotes) {
      vendorSnapshot = {
        name: vendorName || undefined,
        contactEmail: vendorEmail || undefined,
        contactPhone: vendorPhone || undefined,
        website: vendorWebsite || undefined,
        notes: vendorNotes || undefined
      };
    }

    // Resolve vendorId and snapshot similar to createListing
    let vendorId;
    if (vendorIdRaw) {
      try {
        const fetchedVendor = await Vendor.findOne({ _id: vendorIdRaw, owner: currentUserId });
        if (fetchedVendor) {
          vendorId = fetchedVendor._id;
          if (!vendorSnapshot) {
            vendorSnapshot = {
              name: fetchedVendor.name,
              contactEmail: fetchedVendor.contactEmail,
              contactPhone: fetchedVendor.contactPhone,
              website: fetchedVendor.website,
              notes: fetchedVendor.notes
            };
          }
        }
      } catch (e) {
        console.warn('Invalid vendorId for update or not owned by user');
      }
    }

    if (!vendorId && saveVendorFlag && vendorSnapshot && vendorSnapshot.name) {
      try {
        const newVendor = await Vendor.create({ owner: currentUserId, ...vendorSnapshot });
        vendorId = newVendor._id;
      } catch (e) {
        console.error('Failed to save vendor during update:', e.message);
      }
    }

    if (vendorSnapshot) updateData.vendor = vendorSnapshot;
    if (vendorId) updateData.vendorId = vendorId;
    
    // If UPC code is updated, fetch new nutritional information
    if (body.upcCode && body.upcCode !== listing.upcCode) {
      updateData.upcCode = body.upcCode;
      
      try {
        const productInfo = await usdaApi.getProductByUpc(body.upcCode);
        if (productInfo.success) {
          updateData.nutritionalInfo = {
            fdcId: productInfo.data.fdcId,
            brandName: productInfo.data.brandName,
            ingredients: productInfo.data.ingredients,
            servingSize: productInfo.data.servingSize,
            servingSizeUnit: productInfo.data.servingSizeUnit,
            foodNutrients: productInfo.data.foodNutrients
          };
        }
      } catch (upcError) {
        console.error('Error fetching UPC data:', upcError);
        // Continue with listing update even if UPC lookup fails
      }
    }
    
    // Handle groupBuy updates (support bracketed fields)
    const gbEnabledRawU = getField('groupBuy[enabled]');
    const gbMinCasesRawU = getField('groupBuy[minCases]');
    const gbTargetCasesRawU = getField('groupBuy[targetCases]');
    const gbDeadlineRawU = getField('groupBuy[deadline]');
    const gbU = {};
    if (gbEnabledRawU !== undefined) gbU.enabled = (gbEnabledRawU === 'true' || gbEnabledRawU === true || gbEnabledRawU === 'on' || gbEnabledRawU === '1');
    if (gbMinCasesRawU !== undefined) gbU.minCases = Number(gbMinCasesRawU);
    if (gbTargetCasesRawU !== undefined) gbU.targetCases = Number(gbTargetCasesRawU);
    if (gbDeadlineRawU) gbU.deadline = new Date(gbDeadlineRawU);
    if (Object.keys(gbU).length) updateData.groupBuy = gbU;

    // Handle pieceOrdering enable/disable
    const poEnabledRawU = getField('pieceOrdering[enabled]');
    if (poEnabledRawU !== undefined) {
      const enablePo = (poEnabledRawU === 'true' || poEnabledRawU === true || poEnabledRawU === 'on' || poEnabledRawU === '1');
      if (enablePo) {
        if (typeof listing.caseSize !== 'number' || listing.caseSize < 1) {
          return res.status(400).json({ success: false, message: 'Case size must be set to enable per-piece ordering' });
        }
        updateData.pieceOrdering = {
          enabled: true,
          currentCaseNumber: listing.pieceOrdering?.currentCaseNumber || 1,
          currentCaseRemaining: (listing.pieceOrdering?.currentCaseRemaining ?? listing.caseSize),
          casesFulfilled: listing.pieceOrdering?.casesFulfilled || 0,
          reservations: listing.pieceOrdering?.reservations || []
        };
        // If currentCaseRemaining is 0 for some reason, reset to full case
        if (updateData.pieceOrdering.currentCaseRemaining <= 0) {
          updateData.pieceOrdering.currentCaseRemaining = listing.caseSize;
        }
      } else {
        updateData.pieceOrdering = { enabled: false };
      }
    }

    // Update the listing
    const updatedListing = await Listing.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );
    
    res.status(200).json({
      success: true,
      message: "Listing updated successfully",
      data: updatedListing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update listing",
      error: error.message
    });
  }
};

/**
 * Delete a listing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found"
      });
    }
    
    // Check if the user is the owner of the listing (use authenticated user)
    const currentUserId = (req.user && (req.user.id || req.user._id)) || (function(){
      try {
        const tokenFromCookie = req.cookies && req.cookies.token;
        const authHeader = req.headers && req.headers.authorization;
        const rawToken = tokenFromCookie || (authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) : null);
        if (rawToken) {
          const decoded = jwt.verify(rawToken, process.env.JWT_SECRET || 'bezkoder-secret-key');
          if (decoded && decoded.id) return decoded.id;
        }
      } catch (_) {}
      return null;
    })();

    if (!currentUserId || String(listing.seller) !== String(currentUserId)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this listing"
      });
    }
    
    // Prevent deletion when there are active commitments
    const gb = listing.groupBuy || {};
    const hasGbParticipants = Array.isArray(gb.participants) && gb.participants.some(p => Number(p?.cases || 0) > 0);
    const hasGbCommitted = Number(gb.committedCases || 0) > 0;
    const hasActiveGroupBuy = !!(gb.enabled && (hasGbParticipants || hasGbCommitted));

    const po = listing.pieceOrdering || {};
    const hasActivePieceReservations = !!(po.enabled && Array.isArray(po.reservations) && po.reservations.some(r => r && r.status === 'filling' && Number(r.pieces || 0) > 0));
    const caseSizeNum = Number(listing.caseSize || 0);
    const hasCaseInProgress = !!(po.enabled && caseSizeNum > 0 && typeof po.currentCaseRemaining === 'number' && po.currentCaseRemaining < caseSizeNum);
    const hasActivePerPiece = hasActivePieceReservations || hasCaseInProgress;

    if (hasActiveGroupBuy || hasActivePerPiece) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete listing with active commitments',
        details: {
          groupBuy: hasActiveGroupBuy ? {
            enabled: !!gb.enabled,
            participants: Array.isArray(gb.participants) ? gb.participants.length : 0,
            committedCases: Number(gb.committedCases || 0)
          } : undefined,
          pieceOrdering: hasActivePerPiece ? {
            enabled: !!po.enabled,
            currentCaseNumber: po.currentCaseNumber || 1,
            currentCaseRemaining: po.currentCaseRemaining,
            reservationsCount: Array.isArray(po.reservations) ? po.reservations.filter(r => r && r.status === 'filling' && Number(r.pieces || 0) > 0).length : 0
          } : undefined
        }
      });
    }
    
    await Listing.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      success: true,
      message: "Listing deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete listing",
      error: error.message
    });
  }
};

/**
 * Group Buy: get status for a listing
 */
exports.groupBuyStatus = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id).select('groupBuy caseSize casePrice');
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    const gb = listing.groupBuy || {};
    const now = new Date();
    const isExpired = !!(gb.deadline && new Date(gb.deadline) < now);
    const participantsCount = Array.isArray(gb.participants) ? gb.participants.length : 0;
    const userId = getUserId(req);
    let userCommit = 0;
    if (userId && Array.isArray(gb.participants)) {
      const p = gb.participants.find(x => String(x.user) === String(userId));
      if (p) userCommit = p.cases || 0;
    }
    const payload = {
      enabled: !!gb.enabled,
      minCases: gb.minCases || 0,
      targetCases: gb.targetCases || 0,
      committedCases: gb.committedCases || 0,
      deadline: gb.deadline || null,
      isExpired,
      participantsCount,
      caseSize: listing.caseSize || 1,
      casePrice: listing.casePrice || null,
      userCommit
    };
    if (!gb.enabled) return res.status(200).json({ success: true, data: { enabled: false } });
    return res.status(200).json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch group buy status', error: error.message });
  }
};

/**
 * Group Buy: commit cases for current user
 */
exports.groupBuyCommit = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    let { cases } = req.body || {};
    cases = Number(cases);
    if (!cases || Number.isNaN(cases) || cases < 1) return res.status(400).json({ success: false, message: 'cases must be a positive number' });

    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    const gb = listing.groupBuy || {};
    if (!gb.enabled) return res.status(400).json({ success: false, message: 'Group buy is not enabled for this listing' });
    const now = new Date();
    if (gb.deadline && new Date(gb.deadline) < now) return res.status(400).json({ success: false, message: 'Group buy has ended' });

    // Upsert participant
    if (!Array.isArray(gb.participants)) gb.participants = [];
    const idx = gb.participants.findIndex(p => String(p.user) === String(userId));
    let delta = cases;
    if (idx >= 0) {
      const prev = Number(gb.participants[idx].cases || 0);
      gb.participants[idx].cases = cases; // set to new value
      delta = cases - prev;
    } else {
      gb.participants.push({ user: userId, cases, committedAt: new Date() });
    }
    gb.committedCases = Math.max(0, Number(gb.committedCases || 0) + Number(delta));
    listing.groupBuy = gb;
    await listing.save();
    return res.status(200).json({ success: true, message: 'Commitment saved', data: { committedCases: gb.committedCases, yourCases: cases } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to commit to group buy', error: error.message });
  }
};

/**
 * Group Buy: cancel commitment for current user
 */
exports.groupBuyCancel = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    const gb = listing.groupBuy || {};
    if (!Array.isArray(gb.participants)) gb.participants = [];
    const idx = gb.participants.findIndex(p => String(p.user) === String(userId));
    if (idx === -1) return res.status(200).json({ success: true, message: 'No existing commitment' });
    const prev = Number(gb.participants[idx].cases || 0);
    gb.participants.splice(idx, 1);
    gb.committedCases = Math.max(0, Number(gb.committedCases || 0) - prev);
    listing.groupBuy = gb;
    await listing.save();
    return res.status(200).json({ success: true, message: 'Commitment canceled', data: { committedCases: gb.committedCases } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to cancel commitment', error: error.message });
  }
};

/**
 * Search listings by keyword
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.searchListings = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required"
      });
    }
    
    const listings = await Listing.find(
      { $text: { $search: query } },
      { score: { $meta: "textScore" } }
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(10)
    .populate('seller', 'username profileImage');
    
    res.status(200).json({
      success: true,
      data: listings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to search listings",
      error: error.message
    });
  }
};

/**
 * Look up product information by UPC code
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.lookupUpc = async (req, res) => {
  upcLogger.log('==== UPC LOOKUP START ====', new Date().toISOString());
  try {
    const { upc } = req.params;
    const isDebug = !!(req.query && (req.query.debug === '1' || req.query.debug === 'true' || req.query.debug === 'yes'));
    upcLogger.log('[REQ] UPC param:', upc, 'IP:', req.ip);

    if (!upc) {
      upcLogger.error('[REQ] Missing UPC');
      return res.status(400).json({ success: false, message: 'UPC code is required' });
    }

    const candidates = normalizeUpcCandidates(upc);
    if (candidates.length === 0) {
      upcLogger.error('[REQ] Invalid UPC format (no digits):', upc);
      return res.status(400).json({ success: false, message: 'Invalid UPC code format. Digits only.' });
    }

    // Tier 1: Open Food Facts
    for (const code of candidates) {
      try {
        const hit = await tryOpenFoodFacts(code);
        if (hit) {
          const payload = {
            success: true,
            data: {
              description: hit.title,
              brandName: hit.brand,
              upc: code,
              imageUrl: hit.imageUrl,
              isGenericFallback: false
            },
            source: hit.source
          };
          return res.status(200).json(payload);
        }
      } catch (e) { upcLogger.error('[OFF] error for', code, e && e.message); }
    }

    // Tier 2 removed: Paid UPC APIs are not used by policy

    // Tier 3: USDA (existing fallback in project)
    try {
      const primary = candidates[0];
      upcLogger.log('[USDA] Fallback for', primary, 'key?', !!process.env.USDA_API_KEY);
      const productInfo = await usdaApi.getProductByUpc(primary);
      const incoming = productInfo && productInfo.data ? productInfo.data : {};
      const base = incoming && typeof incoming === 'object' ? (incoming.product || incoming) : {};
      const normalized = {
        description: base.description || incoming.description || `Product (UPC: ${primary})`,
        brandName: base.brandName || incoming.brandName || 'Unknown Brand',
        ingredients: base.ingredients || incoming.ingredients || 'No ingredients information available',
        upc: base.upc || incoming.upc || primary,
        isGenericFallback: Boolean((incoming && incoming.isGenericFallback) || (base && base.isGenericFallback))
      };
      return res.status(200).json({ success: true, data: normalized, source: 'usda' });
    } catch (apiError) {
      upcLogger.error('[USDA] error:', apiError && apiError.message);
      const primary = candidates[0];
      const debugInfo = isDebug ? {
        upstreamError: String(apiError && (apiError.message || apiError)),
        hasApiKey: !!process.env.USDA_API_KEY,
        nodeEnv: process.env.NODE_ENV || 'development'
      } : undefined;
      return res.status(200).json({
        success: true,
        message: 'Created generic product info due to API error',
        data: {
          description: `Product (UPC: ${primary})`,
          brandName: 'Unknown Brand',
          ingredients: 'No ingredients information available',
          upc: primary,
          isGenericFallback: true
        },
        ...(debugInfo ? { debug: debugInfo } : {})
      });
    }
  } catch (error) {
    upcLogger.error('[Controller] fatal error:', error && error.message);
    const code = digitsOnly(req.params && req.params.upc);
    const isDebug = !!(req.query && (req.query.debug === '1' || req.query.debug === 'true' || req.query.debug === 'yes'));
    const debugInfo = isDebug ? {
      controllerError: String(error && (error.message || error)),
      hasApiKey: !!process.env.USDA_API_KEY,
      nodeEnv: process.env.NODE_ENV || 'development'
    } : undefined;
    return res.status(200).json({
      success: true,
      message: 'Created generic product info due to server error',
      data: {
        description: `Product (UPC code: ${code || 'unknown'})`,
        brandName: 'Unknown Brand',
        ingredients: 'No ingredients information available',
        upc: code || 'unknown',
        isGenericFallback: true
      },
      ...(debugInfo ? { debug: debugInfo } : {})
    });
  } finally {
    upcLogger.log('==== UPC LOOKUP END ====');
  }
};

/**
 * Search for food items by name using USDA API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.searchFoodItems = async (req, res) => {
  console.log(' API ENDPOINT CALLED: /api/marketplace/food-search');
  try {
    // Log request details
    console.log('Request query parameters:', req.query);
    const { query } = req.query;
    console.log('Search query:', query);
    
    // Check if environment variables are properly loaded
    console.log('USDA_API_KEY exists:', !!process.env.USDA_API_KEY);
    if (process.env.USDA_API_KEY) {
      const keyLength = process.env.USDA_API_KEY.length;
      console.log('API Key Length:', keyLength);
      console.log('API Key Preview:', `${process.env.USDA_API_KEY.substring(0, 3)}...${process.env.USDA_API_KEY.substring(keyLength - 3)}`);
    }
    
    // Validate query
    if (!query || query.trim().length < 2) {
      console.log('Invalid query - too short');
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }
    
    console.log('Calling USDA API service...');
    // Call USDA API to search for food items
    const result = await usdaApi.searchFoodItems(query);
    console.log('USDA API service returned with success:', result.success);
    console.log('Result contains mock data:', !!result.isMockData);
    console.log('Number of results:', result.data ? result.data.length : 0);
    
    // Log a sample of the results
    if (result.data && result.data.length > 0) {
      console.log('Sample result:', JSON.stringify(result.data[0], null, 2));
    }
    
    // Format response to match what the frontend expects
    const responseData = {
      success: result.success,
      data: result.data || [],
      // Pass through the isMockData flag from the API result
      // Only set it to true if explicitly set in the result
      isMockData: result.isMockData || false,
      items: result.data || [] // Adding this for compatibility with the test-usda-api.html page
    };
    
    // Add detailed logging about the response we're sending
    console.log('Sending response to client with format:', Object.keys(responseData));
    console.log('Response contains mock data flag:', responseData.isMockData);
    console.log('Response data length:', responseData.data.length);
    
    res.status(200).json(responseData);
  } catch (error) {
    console.error(' ERROR searching food items:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to search food items',
      error: error.message
    });
  }
};

// List saved vendors for current user
exports.getMyVendors = async (req, res) => {
  try {
    const userId = getUserId(req);
    console.log('[getMyVendors] userId:', userId);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const vendors = await Vendor.find({ owner: userId }).sort({ updatedAt: -1 });
    console.log('[getMyVendors] found vendors:', Array.isArray(vendors) ? vendors.length : 0);
    res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    console.error('[getMyVendors] error:', error && error.name, error && error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors', error: error.message });
  }
};

// Create a saved vendor for current user
exports.createVendor = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    let { name, contactEmail, contactPhone, website, notes } = req.body || {};
    website = normalizeUrl(website);
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Vendor name is required' });
    const vendor = await Vendor.create({ owner: userId, name: name.trim(), contactEmail, contactPhone, website, notes });
    res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create vendor', error: error.message });
  }
};

// Get prior listings for current user (templates for prefill)
exports.getMyListingTemplates = async (req, res) => {
  try {
    const userId = getUserId(req);
    console.log('[getMyListingTemplates] userId:', userId);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const listings = await Listing.find({ seller: userId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('title description price casePrice priceUnit category quantity caseSize isOrganic vendor vendorId upcCode groupBuy pieceOrdering');
    console.log('[getMyListingTemplates] found templates:', Array.isArray(listings) ? listings.length : 0);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    console.error('[getMyListingTemplates] error:', error && error.name, error && error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch templates', error: error.message });
  }
};

// Update a saved vendor (owner only)
exports.updateVendor = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { id } = req.params;
    let { name, contactEmail, contactPhone, website, notes } = req.body || {};
    if (website !== undefined) website = normalizeUrl(website);
    const vendor = await Vendor.findOne({ _id: id, owner: userId });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    if (name !== undefined) vendor.name = name;
    if (contactEmail !== undefined) vendor.contactEmail = contactEmail;
    if (contactPhone !== undefined) vendor.contactPhone = contactPhone;
    if (website !== undefined) vendor.website = website;
    if (notes !== undefined) vendor.notes = notes;
    await vendor.save();
    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update vendor', error: error.message });
  }
};

// Delete a saved vendor (owner only)
exports.deleteVendor = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { id } = req.params;
    const vendor = await Vendor.findOneAndDelete({ _id: id, owner: userId });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.status(200).json({ success: true, message: 'Vendor deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete vendor', error: error.message });
  }
};

// ===== Piece Ordering Endpoints =====
/**
 * Get per-piece status for a listing
 */
exports.pieceStatus = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id).select('title caseSize pieceOrdering');
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    const po = listing.pieceOrdering || {};
    // Auto-enable per-piece ordering when caseSize is set (policy: per-piece only)
    if (!po.enabled) {
      let cs = Number(listing.caseSize || 0);
      let setCaseSize = false;
      if (!(cs > 0)) { cs = 1; setCaseSize = true; }
      if (cs > 0) {
        const initPO = {
          enabled: true,
          currentCaseNumber: 1,
          currentCaseRemaining: cs,
          casesFulfilled: 0,
          reservations: []
        };
        try {
          const update = setCaseSize ? { pieceOrdering: initPO, caseSize: cs } : { pieceOrdering: initPO };
          await Listing.updateOne({ _id: listing._id }, { $set: update });
        } catch (_) {}
        // Return initialized state immediately
        return res.status(200).json({
          success: true,
          data: {
            enabled: true,
            caseSize: cs,
            currentCaseNumber: 1,
            currentCaseRemaining: cs,
            casesFulfilled: 0,
            userPieces: 0
          }
        });
      }
      return res.status(200).json({ success: true, data: { enabled: false } });
    }
    const userId = getUserId(req);
    let userPieces = 0;
    const currentCase = po.currentCaseNumber || 1;
    if (userId && Array.isArray(po.reservations)) {
      const r = po.reservations.find(x => String(x.user) === String(userId) && x.status === 'filling' && x.caseNumber === currentCase);
      if (r) userPieces = Number(r.pieces || 0);
    }
    return res.status(200).json({
      success: true,
      data: {
        enabled: true,
        caseSize: listing.caseSize || 1,
        currentCaseNumber: currentCase,
        currentCaseRemaining: po.currentCaseRemaining ?? (listing.caseSize || 0),
        casesFulfilled: po.casesFulfilled || 0,
        userPieces
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch piece status', error: error.message });
  }
};

/**
 * Set user's pieces for the current case (absolute). Caps by remaining and case size.
 */
exports.pieceSet = async (req, res) => {
  try {
    console.log('[pieceSet] listingId:', req.params && req.params.id);
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    let { pieces } = req.body || {};
    pieces = Number(pieces);
    if (Number.isNaN(pieces) || pieces < 0) return res.status(400).json({ success: false, message: 'pieces must be a non-negative number' });

    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    let po = listing.pieceOrdering || {};
    if (!po.enabled) {
      let cs = Number(listing.caseSize || 0);
      if (!(cs > 0)) cs = 1; // default when missing
      if (cs > 0) {
        listing.caseSize = cs;
        listing.pieceOrdering = {
          enabled: true,
          currentCaseNumber: 1,
          currentCaseRemaining: cs,
          casesFulfilled: 0,
          reservations: []
        };
        po = listing.pieceOrdering;
      } else {
        return res.status(400).json({ success: false, message: 'Per-piece ordering is not enabled for this listing' });
      }
    }
    if (typeof listing.caseSize !== 'number' || listing.caseSize < 1) return res.status(400).json({ success: false, message: 'Invalid case size' });
    if (!Array.isArray(po.reservations)) po.reservations = [];
    if (typeof po.currentCaseNumber !== 'number' || po.currentCaseNumber < 1) po.currentCaseNumber = 1;
    if (typeof po.currentCaseRemaining !== 'number') po.currentCaseRemaining = listing.caseSize;

    const currentCase = po.currentCaseNumber;
    const idx = po.reservations.findIndex(x => String(x.user) === String(userId) && x.status === 'filling' && x.caseNumber === currentCase);
    const prev = idx >= 0 ? Number(po.reservations[idx].pieces || 0) : 0;

    if (pieces === 0) {
      if (idx >= 0) {
        po.currentCaseRemaining = Math.max(0, po.currentCaseRemaining + prev);
        po.reservations.splice(idx, 1);
      }
    } else {
      const maxAllowed = listing.caseSize;
      let desired = Math.min(pieces, maxAllowed);
      const maxAbsolute = prev + po.currentCaseRemaining;
      if (desired > maxAbsolute) desired = maxAbsolute;
      const delta = desired - prev;
      po.currentCaseRemaining = Math.max(0, po.currentCaseRemaining - Math.max(0, delta));
      if (idx >= 0) {
        po.reservations[idx].pieces = desired;
      } else {
        po.reservations.push({ user: userId, caseNumber: currentCase, pieces: desired, status: 'filling', reservedAt: new Date() });
      }
    }

    let caseClosed = false;
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
      caseClosed = true;
    }

    // Persist without triggering full document validation (some legacy listings may miss required fields like `group`)
    await Listing.updateOne({ _id: listing._id }, { $set: { pieceOrdering: po } });

    return res.status(200).json({
      success: true,
      message: 'Reservation updated',
      data: {
        caseClosed,
        currentCaseNumber: po.currentCaseNumber,
        currentCaseRemaining: po.currentCaseRemaining,
        userPieces: (function(){
          const r = (po.reservations || []).find(x => String(x.user) === String(userId) && x.status === 'filling' && x.caseNumber === po.currentCaseNumber);
          return r ? Number(r.pieces || 0) : 0;
        })()
      }
    });
  } catch (error) {
    console.error('❌ [pieceSet] error:', error && error.message);
    if (error && error.stack) console.error(error.stack);
    res.status(500).json({ success: false, message: 'Failed to set per-piece reservation', error: error.message });
  }
};

// ... (rest of the code remains the same)

/**
 * Cancel user's active reservation on the current case
 */
exports.pieceCancel = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    const po = listing.pieceOrdering || {};
    if (!po.enabled) {
      const cs = Number(listing.caseSize || 0);
      if (cs > 0) {
        listing.pieceOrdering = {
          enabled: true,
          currentCaseNumber: 1,
          currentCaseRemaining: cs,
          casesFulfilled: 0,
          reservations: []
        };
      } else {
        return res.status(400).json({ success: false, message: 'Per-piece ordering is not enabled for this listing' });
      }
    }
    if (!Array.isArray(po.reservations)) po.reservations = [];
    const currentCase = po.currentCaseNumber || 1;
    const idx = po.reservations.findIndex(x => String(x.user) === String(userId) && x.status === 'filling' && x.caseNumber === currentCase);
    if (idx === -1) return res.status(200).json({ success: true, message: 'No active reservation' });
    const prev = Number(po.reservations[idx].pieces || 0);
    po.currentCaseRemaining = Math.max(0, (po.currentCaseRemaining ?? 0) + prev);
    po.reservations.splice(idx, 1);
    await Listing.updateOne({ _id: listing._id }, { $set: { pieceOrdering: po } });
    return res.status(200).json({ success: true, message: 'Reservation canceled', data: { currentCaseNumber: po.currentCaseNumber, currentCaseRemaining: po.currentCaseRemaining, yourPieces: 0 } });
  } catch (error) {
    console.error('❌ [pieceCancel] error:', error && error.message);
    if (error && error.stack) console.error(error.stack);
    return res.status(500).json({ success: false, message: 'Failed to cancel reservation', error: error.message });
  }
};

/**
 * Get current user's active per-piece reservations (for cart)
 */
exports.myPieceReservations = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const listings = await Listing.find({
      'pieceOrdering.enabled': true,
      'pieceOrdering.reservations': { $elemMatch: { user: userId, status: { $in: ['filling', 'fulfilled'] } } }
    }).select('title images price priceUnit casePrice caseSize pieceOrdering vendor caseUnitPrice');

    const data = (listings || []).map(lst => {
      const po = lst.pieceOrdering || {};
      const currentCase = po.currentCaseNumber || 1;
      // Sum all active 'filling' reservations for this user regardless of case number
      const userPieces = (po.reservations || [])
        .filter(r => String(r.user) === String(userId) && (r.status === 'filling' || r.status === 'fulfilled'))
        .reduce((sum, r) => sum + (Number(r.pieces || 0) || 0), 0);
      // derive a unit price for per-piece subtotal calculations
      const priceUnitStr = String(lst.priceUnit || '').toLowerCase();
      const hasExplicitUnitPrice = (typeof lst.price === 'number') && lst.price > 0 && priceUnitStr !== 'case';
      const derivedUnitPrice = (typeof lst.caseUnitPrice === 'number')
        ? lst.caseUnitPrice
        : ((typeof lst.casePrice === 'number' && typeof lst.caseSize === 'number' && lst.caseSize > 0)
          ? (lst.casePrice / lst.caseSize)
          : null);
      // Prefer the case breakdown price when available (keeps UI and cart consistent)
      const unitPrice = (typeof derivedUnitPrice === 'number')
        ? derivedUnitPrice
        : (hasExplicitUnitPrice ? lst.price : null);
      const priceUnit = 'each';
      return {
        listingId: lst._id,
        title: lst.title,
        image: (Array.isArray(lst.images) && lst.images[0]) ? lst.images[0] : null,
        caseSize: lst.caseSize || 1,
        currentCaseNumber: currentCase,
        currentCaseRemaining: po.currentCaseRemaining ?? (lst.caseSize || 0),
        userPieces,
        // Fields consumed by cart.js
        pieces: userPieces,
        caseNumber: currentCase,
        piecesLeftToFill: Math.max(0, (po.currentCaseRemaining ?? 0)),
        unitPrice: (typeof unitPrice === 'number') ? unitPrice : null,
        priceUnit
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch reservations', error: error.message });
  }
};
