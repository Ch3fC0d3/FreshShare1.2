const mongoose = require('mongoose');
const Group = require('../models/group.model');
const User = require('../models/user.model');
const GroupMessage = require('../models/groupMessage.model');
const GroupEvent = require('../models/groupEvent.model');

let ShoppingListItem = null;
try {
  ShoppingListItem = mongoose.model('ShoppingListItem');
} catch (err) {
  ShoppingListItem = null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_ACTIVE_PRODUCTS_CAP = 200;

const isGroupMember = (group, userId) => {
  if (!group || !userId) return false;
  return Array.isArray(group.members) && group.members.some((member) => String(member) === String(userId));
};

const isGroupAdmin = (group, userId) => {
  if (!group || !userId) return false;
  return Array.isArray(group.admins) && group.admins.some((admin) => String(admin) === String(userId));
};

const buildUserSummary = (user) => {
  if (!user) return null;
  const id = user._id ? String(user._id) : String(user);
  const username = user.username || null;
  const displayName = user.username
    || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || null;
  return {
    id,
    username,
    displayName
  };
};

const findProductById = (group, productId) => {
  if (!group || !productId) {
    return { product: null, index: -1 };
  }

  const productIdStr = String(productId);
  const products = Array.isArray(group.products) ? group.products : [];
  const index = products.findIndex((product) => String(product._id) === productIdStr);

  return {
    product: index >= 0 ? products[index] : null,
    index
  };
};

const populateProductCreators = async (group) => {
  if (!group || typeof group.populate !== 'function') return group;
  await group.populate([
    { path: 'products.createdBy', select: 'username firstName lastName email' },
    { path: 'products.lastUpdatedBy', select: 'username firstName lastName email' }
  ]);
  return group;
};

const clampNumber = (value, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, fallback = null, round = true } = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(Math.max(num, min), max);
  return round ? Math.round(clamped) : clamped;
};

const parseMaxActiveProducts = (value, current = 20) => {
  const parsed = clampNumber(value, { min: 0, max: MAX_ACTIVE_PRODUCTS_CAP, fallback: current });
  return parsed === null ? current : parsed;
};

const trimToString = (value, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
};

const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toNonNegativeNumber = (value, fallback = 0) => {
  const num = toFiniteNumber(value, fallback);
  return num < 0 ? fallback : num;
};

const toPriceNumber = (value, fallback = 0) => {
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.round(num * 100) / 100;
};

const deriveTotalUnits = ({ totalUnits = 0, quantity = 0, caseSize = 0 }) => {
  const provided = toNonNegativeNumber(totalUnits, 0);
  if (provided > 0) return provided;
  const qty = toNonNegativeNumber(quantity, 0);
  const size = toNonNegativeNumber(caseSize, 0);
  const derived = qty > 0 && size > 0 ? qty * size : 0;
  return derived > 0 ? derived : 0;
};

const ensureDerivedFields = (product) => {
  if (!product) return;
  product.totalUnits = deriveTotalUnits({
    totalUnits: product.totalUnits,
    quantity: product.quantity,
    caseSize: product.caseSize
  });
  if ((!Number.isFinite(product.unitPrice) || product.unitPrice <= 0) && Number.isFinite(product.casePrice) && product.casePrice > 0) {
    const totalUnits = Number(product.totalUnits);
    product.unitPrice = totalUnits > 0 ? Math.round((product.casePrice / totalUnits) * 100) / 100 : 0;
  }
};

const applyProductDetails = (product, payload = {}, {
  userId = null,
  allowedFields = [],
  allowStatusUpdates = false,
  allowScoreUpdates = false
} = {}) => {
  if (!product || !payload) return false;
  const allowAll = allowedFields === 'all';
  const allowField = (field) => allowAll || allowedFields.includes(field);
  let changed = false;

  const assignValue = (field, value) => {
    if (!allowField(field)) return;
    if (value === undefined) return;
    if (product[field] !== value) {
      product[field] = value;
      changed = true;
    }
  };

  if (allowField('name') && typeof payload.name === 'string') {
    const next = trimToString(payload.name);
    if (next) assignValue('name', next);
  }

  if (allowField('note') && payload.note !== undefined) {
    assignValue('note', trimToString(payload.note));
  }

  if (allowField('imageUrl') && payload.imageUrl !== undefined) {
    assignValue('imageUrl', trimToString(payload.imageUrl));
  }

  if (allowField('productUrl') && payload.productUrl !== undefined) {
    assignValue('productUrl', trimToString(payload.productUrl));
  }

  if (allowField('vendor') && payload.vendor !== undefined) {
    assignValue('vendor', trimToString(payload.vendor));
  }

  if (allowField('unitSize') && payload.unitSize !== undefined) {
    assignValue('unitSize', trimToString(payload.unitSize));
  }

  if (allowField('unitName') && payload.unitName !== undefined) {
    assignValue('unitName', trimToString(payload.unitName));
  }

  if (allowField('caseSize') && payload.caseSize !== undefined) {
    assignValue('caseSize', toNonNegativeNumber(payload.caseSize, product.caseSize || 0));
  }

  if (allowField('quantity') && payload.quantity !== undefined) {
    assignValue('quantity', toNonNegativeNumber(payload.quantity, product.quantity || 0));
  }

  if (allowField('totalUnits') && payload.totalUnits !== undefined) {
    assignValue('totalUnits', toNonNegativeNumber(payload.totalUnits, product.totalUnits || 0));
  }

  if (allowField('casePrice') && payload.casePrice !== undefined) {
    assignValue('casePrice', toPriceNumber(payload.casePrice, product.casePrice || 0));
  }

  if (allowField('unitPrice') && payload.unitPrice !== undefined) {
    assignValue('unitPrice', toPriceNumber(payload.unitPrice, product.unitPrice || 0));
  }

  if (allowField('purchaseNotes') && payload.purchaseNotes !== undefined) {
    assignValue('purchaseNotes', trimToString(payload.purchaseNotes));
  }

  if (allowField('availabilityNote') && payload.availabilityNote !== undefined) {
    assignValue('availabilityNote', trimToString(payload.availabilityNote));
  }

  if (allowField('isPreset') && payload.isPreset !== undefined) {
    assignValue('isPreset', Boolean(payload.isPreset));
  }

  if (allowField('statusLocked') && payload.statusLocked !== undefined) {
    assignValue('statusLocked', Boolean(payload.statusLocked));
  }

  if (allowStatusUpdates && payload.status && ['active', 'requested'].includes(payload.status)) {
    assignValue('status', payload.status);
  }

  if (allowStatusUpdates && payload.pinned !== undefined) {
    assignValue('pinned', Boolean(payload.pinned));
  }

  if (allowScoreUpdates && Number.isFinite(payload.score)) {
    assignValue('score', Number(payload.score));
  }

  ensureDerivedFields(product);

  if (changed) {
    const now = new Date();
    product.lastActivityAt = now;
    product.updatedAt = now;
    if (userId) {
      product.lastUpdatedBy = userId;
    }
  }

  return changed;
};

const buildProductDoc = (data, userId, options = {}) => {
  if (!data || !data.name || typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error('Product name is required');
  }

  const now = new Date();
  const baseDoc = {
    _id: new mongoose.Types.ObjectId(),
    name: trimToString(data.name),
    note: trimToString(data.note),
    imageUrl: trimToString(data.imageUrl),
    productUrl: trimToString(data.productUrl),
    vendor: '',
    unitSize: '',
    unitName: '',
    caseSize: 0,
    quantity: 1,
    totalUnits: 0,
    casePrice: 0,
    unitPrice: 0,
    purchaseNotes: '',
    availabilityNote: '',
    isPreset: Boolean(options.isPreset || data.isPreset),
    statusLocked: Boolean(options.statusLocked || data.statusLocked),
    createdBy: userId,
    lastUpdatedBy: userId,
    status: options.status || 'requested',
    score: Number.isFinite(options.score) ? options.score : (options.defaultScore || 0),
    upvoters: Array.isArray(options.upvoters) ? options.upvoters : [],
    downvoters: Array.isArray(options.downvoters) ? options.downvoters : [],
    pinned: Boolean(options.pinned || data.pinned),
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now
  };

  applyProductDetails(baseDoc, data, {
    userId,
    allowedFields: 'all',
    allowStatusUpdates: true,
    allowScoreUpdates: Boolean(options.allowScoreUpdates)
  });

  if (options.status) {
    baseDoc.status = options.status;
  }

  ensureDerivedFields(baseDoc);

  return baseDoc;
};

const recalculateProductRanks = (group) => {
  if (!group || !Array.isArray(group.products)) return false;
  let changed = false;
  const products = group.products.map((product) => {
    const doc = product;
    const upCount = Array.isArray(doc.upvoters) ? doc.upvoters.length : 0;
    const downCount = Array.isArray(doc.downvoters) ? doc.downvoters.length : 0;
    const newScore = upCount - downCount;
    if (doc.score !== newScore) {
      doc.score = newScore;
      changed = true;
    }
    if (!doc.lastActivityAt) {
      doc.lastActivityAt = doc.updatedAt || doc.createdAt || new Date();
      changed = true;
    }
    ensureDerivedFields(doc);
    return doc;
  });

  const maxActive = Number.isFinite(group.maxActiveProducts)
    ? Math.max(0, Math.min(group.maxActiveProducts, MAX_ACTIVE_PRODUCTS_CAP))
    : 0;

  products.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    const aTime = new Date(a.lastActivityAt || 0).getTime();
    const bTime = new Date(b.lastActivityAt || 0).getTime();
    return bTime - aTime;
  });

  products.forEach((product, index) => {
    const targetStatus = index < maxActive ? 'active' : 'requested';
    if (!product.statusLocked && product.status !== targetStatus) {
      product.status = targetStatus;
      changed = true;
    }
  });

  if (changed) {
    group.products = products;
    group.markModified('products');
  }

  return changed;
};

const serializeProduct = (product, userId) => {
  if (!product) return null;
  const upvoters = Array.isArray(product.upvoters) ? product.upvoters.map(String) : [];
  const downvoters = Array.isArray(product.downvoters) ? product.downvoters.map(String) : [];
  const createdBy = buildUserSummary(product.createdBy);
  const createdById = createdBy ? createdBy.id : product.createdBy ? String(product.createdBy) : null;
  const userIdStr = userId ? String(userId) : null;
  const lastUpdatedBy = buildUserSummary(product.lastUpdatedBy);
  const userVote = userIdStr
    ? upvoters.includes(userIdStr)
      ? 'up'
      : downvoters.includes(userIdStr)
        ? 'down'
        : null
    : null;

  return {
    id: String(product._id),
    name: product.name,
    note: product.note,
    imageUrl: product.imageUrl,
    productUrl: product.productUrl,
    vendor: product.vendor || '',
    unitSize: product.unitSize || '',
    unitName: product.unitName || '',
    caseSize: toNonNegativeNumber(product.caseSize, 0),
    quantity: toNonNegativeNumber(product.quantity, 0),
    totalUnits: toNonNegativeNumber(product.totalUnits, 0),
    casePrice: toPriceNumber(product.casePrice, 0),
    unitPrice: toPriceNumber(product.unitPrice, 0),
    purchaseNotes: product.purchaseNotes || '',
    availabilityNote: product.availabilityNote || '',
    status: product.status,
    score: product.score,
    pinned: Boolean(product.pinned),
    isPreset: Boolean(product.isPreset),
    statusLocked: Boolean(product.statusLocked),
    createdBy,
    createdById,
    isMine: createdById && userIdStr ? createdById === userIdStr : false,
    upvoteCount: upvoters.length,
    downvoteCount: downvoters.length,
    userVote,
    lastActivityAt: product.lastActivityAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    lastUpdatedBy
  };
};

const composeProductResponse = (group, userId) => {
  const baseList = Array.isArray(group.products) ? group.products : [];
  const serialized = baseList.map((product, index) => {
    const entry = serializeProduct(product, userId);
    if (!entry) return null;
    entry.rank = index + 1;
    entry.isActiveWithinCap = index < Math.max(0, group.maxActiveProducts || 0);
    return entry;
  }).filter(Boolean);

  const activeProducts = serialized.filter((product) => product.status === 'active');
  const requestedProducts = serialized.filter((product) => product.status === 'requested');
  const pinnedProducts = serialized.filter((product) => product.pinned);

  return {
    products: serialized,
    metrics: {
      totalCount: serialized.length,
      activeCount: activeProducts.length,
      requestedCount: requestedProducts.length,
      pinnedCount: pinnedProducts.length,
      maxActiveProducts: group.maxActiveProducts || 0,
      activeProductIds: activeProducts.map((product) => product.id)
    }
  };
};

const migrateLegacyShoppingItems = async (group) => {
  if (!group || !group._id || typeof ShoppingListItem === 'undefined') {
    return false;
  }

  const legacyItems = await ShoppingListItem.find({ groupId: group._id });
  if (!legacyItems || legacyItems.length === 0) {
    return false;
  }

  const existingNames = new Set((group.products || []).map((product) => (product?.name || '').trim().toLowerCase()).filter(Boolean));
  const additions = [];
  const migratedIds = [];

  legacyItems.forEach((item) => {
    const productName = (item.productName || '').trim();
    if (!productName) {
      return;
    }

    if (existingNames.has(productName.toLowerCase())) {
      return;
    }

    const productDoc = buildProductDoc({
      name: productName,
      vendor: item.vendor,
      casePrice: item.casePrice,
      quantity: item.quantity,
      totalUnits: item.totalUnits,
      purchaseNotes: item.notes
    }, item.createdBy || group.createdBy, {
      status: 'active',
      isPreset: true,
      statusLocked: true,
      defaultScore: 1,
      upvoters: [],
      downvoters: [],
      pinned: false
    });

    additions.push(productDoc);
    migratedIds.push(item._id);
    existingNames.add(productName.toLowerCase());
  });

  if (additions.length === 0) {
    if (migratedIds.length > 0) {
      await ShoppingListItem.deleteMany({ _id: { $in: migratedIds } });
    }
    return false;
  }

  group.products = [...(group.products || []), ...additions];
  group.markModified('products');

  const ranksChanged = recalculateProductRanks(group);
  if (ranksChanged) {
    group.updatedAt = new Date();
  }

  await group.save();
  await ShoppingListItem.deleteMany({ _id: { $in: migratedIds } });
  return true;
};

const normalizeSchedule = (payload) => {
  if (!payload) return null;
  const result = {};
  let hasValue = false;
  const { day = null, time = null } = payload;
  if (DAYS.includes(day)) {
    result.day = day;
    hasValue = true;
  }
  if (typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    result.time = time;
    hasValue = true;
  }
  return hasValue ? result : null;
};

const normalizeRules = (rules) => {
  if (!rules) return {};
  if (typeof rules === 'string') {
    const trimmed = rules.trim();
    return trimmed ? { textDescription: trimmed } : {};
  }
  const normalized = { ...rules };
  if (typeof normalized.textDescription === 'string') {
    normalized.textDescription = normalized.textDescription.trim();
  }
  return normalized;
};

/**
 * Helper function to validate group creation data
 * @param {Object} data - Group creation data
 * @returns {Object} - { isValid, errors }
 */
const validateGroupData = (data) => {
  const errors = [];
  
  // Check required fields
  const requiredFields = ['name', 'description', 'category'];
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  // Check location fields
  if (!data.location || !data.location.city || !data.location.zipCode) {
    errors.push('City and zip code are required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Helper function to populate group data
 * @param {Object} group - Group document
 * @param {string} userId - Optional user ID for membership info
 * @returns {Promise<Object>} - Populated group data
 */
const populateGroupData = async (group, userId = null) => {
  if (!group) return null;

  const groupDoc = await Group.findById(group._id)
    .populate('createdBy', 'username')
    .populate('members', 'username')
    .populate('admins', 'username')
    .populate('products.createdBy', 'username firstName lastName email');

  if (!groupDoc) return null;

  let migrated = false;
  try {
    migrated = await migrateLegacyShoppingItems(groupDoc);
  } catch (migrationError) {
    console.error('Error migrating legacy shopping list items for group', groupDoc._id, migrationError);
  }

  const ranksChanged = recalculateProductRanks(groupDoc);
  if (ranksChanged) {
    await groupDoc.save();
  }

  const groupObj = groupDoc.toObject();
  const { products, metrics } = composeProductResponse(groupDoc, userId);
  groupObj.products = products;
  groupObj.productMetrics = metrics;
  groupObj.maxActiveProducts = groupDoc.maxActiveProducts;

  if (userId) {
    const user = await User.findById(userId);
    if (user) {
      groupObj.isMember = user.isMemberOfGroup(groupDoc._id);
      groupObj.isAdmin = user.isAdminOfGroup(groupDoc._id);
      groupObj.isModerator = user.isModeratorOfGroup(groupDoc._id);

      const membership = user.groups.find((m) =>
        m.group.toString() === groupDoc._id.toString()
      );
      if (membership) {
        groupObj.membershipStatus = membership.status;
        groupObj.joinedAt = membership.joinedAt;
        groupObj.role = membership.role;
      }
    }
  }

  return groupObj;
};

/**
 * Create a new group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.createGroup = async (req, res) => {
  try {
    console.log('Creating new group with data:', JSON.stringify(req.body, null, 2));
    console.log('User ID from request:', req.userId);
    console.log('Authorization header:', req.headers.authorization);
    
    // Validate input data
    const validation = validateGroupData(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validation.errors
      });
    }
    
    // Require authentication for group creation
    if (!req.userId) {
      console.log('No user ID found in request. Authentication required for group creation.');
      return res.status(401).json({
        success: false,
        message: 'Authentication required to create a group'
      });
    }
    
    // Find the user by ID
    const user = await User.findById(req.userId);
    if (!user) {
      console.log('User not found with ID:', req.userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const maxActiveProducts = parseMaxActiveProducts(req.body.maxActiveProducts, 20);

    let starterProducts = [];
    if (Array.isArray(req.body.starterProducts)) {
      try {
        starterProducts = req.body.starterProducts.map((product) => buildProductDoc(product, req.userId));
      } catch (productErr) {
        return res.status(400).json({
          success: false,
          message: productErr.message || 'Invalid starter product data'
        });
      }
    }

    // Create group object with validated data
    const orderBySchedule = normalizeSchedule(req.body.orderBySchedule || {
      day: req.body.orderByDay,
      time: req.body.orderByTime
    });

    const deliverySchedule = normalizeSchedule(req.body.deliverySchedule || {
      day: req.body.deliveryDay,
      time: req.body.deliveryTime
    });

    const groupData = {
      name: req.body.name.trim(),
      description: req.body.description.trim(),
      category: req.body.category,
      location: {
        street: (req.body.location.street || '').trim(),
        city: req.body.location.city.trim(),
        state: (req.body.location.state || '').trim(),
        zipCode: req.body.location.zipCode.trim()
      },
      rules: normalizeRules(req.body.rules),
      deliveryDays: req.body.deliveryDays || [],
      isPrivate: req.body.isPrivate || false,
      maxActiveProducts,
      products: starterProducts,
      createdBy: req.userId,
      members: [req.userId],
      admins: [req.userId]
    };

    if (orderBySchedule) {
      groupData.orderBySchedule = orderBySchedule;
    }

    if (deliverySchedule) {
      groupData.deliverySchedule = deliverySchedule;
    }

    // Create and save the group
    const group = new Group(groupData);
    recalculateProductRanks(group);
    const savedGroup = await group.save();
    
    // Add user as admin
    await user.joinGroup(savedGroup._id, 'admin');
    
    // Return populated group data
    const populatedGroup = await populateGroupData(savedGroup, req.userId);
    const productData = composeProductResponse(group, req.userId);
    
    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group: {
        ...populatedGroup,
        maxActiveProducts,
        products: productData.products,
        productMetrics: productData.metrics
      }
    });

  } catch (err) {
    console.error('Error in createGroup:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(err.errors).map(error => error.message)
      });
    }
    
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A group with this name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating group',
      error: err.message
    });
  }
};

/**
 * List ranked products for a group
 */
exports.listGroupProducts = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { status, mine, pinned } = req.query;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const isMember = isGroupMember(group, req.userId);
    const isAdmin = isGroupAdmin(group, req.userId);

    if (!isMember && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only group members can view ranked products'
      });
    }

    try {
      await migrateLegacyShoppingItems(group);
    } catch (migrationError) {
      console.error('Failed migrating legacy shopping items for group', groupId, migrationError);
    }

    await populateProductCreators(group);
    const response = composeProductResponse(group, req.userId);
    let products = response.products;

    if (status) {
      const allowedStatuses = ['active', 'requested', 'all'];
      const normalized = status.toLowerCase();
      if (!allowedStatuses.includes(normalized)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status filter'
        });
      }
      if (normalized !== 'all') {
        products = products.filter((product) => product.status === normalized);
      }
    }

    if (mine === 'true') {
      products = products.filter((product) => product.isMine);
    }

    if (pinned === 'true') {
      products = products.filter((product) => product.pinned);
    }

    res.json({
      success: true,
      products,
      metrics: response.metrics,
      filters: {
        status: status || 'all',
        mine: mine === 'true',
        pinned: pinned === 'true'
      }
    });
  } catch (err) {
    console.error('Error in listGroupProducts:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching ranked products',
      error: err.message
    });
  }
};

/**
 * Suggest a new product
 */
exports.suggestProduct = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    if (!isGroupMember(group, req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only group members can suggest products'
      });
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required'
      });
    }

    const now = new Date();
    const existing = Array.isArray(group.products) ? group.products : [];
    const alreadyExists = existing.some((product) => product.name?.toLowerCase() === name.trim().toLowerCase());
    if (alreadyExists) {
      return res.status(409).json({
        success: false,
        message: 'A product with this name already exists in the ranked list'
      });
    }

    const productDoc = buildProductDoc(req.body, req.userId, {
      status: 'requested',
      defaultScore: 1,
      upvoters: [req.userId],
      downvoters: [],
      pinned: Boolean(req.body.pinned),
      allowScoreUpdates: false
    });

    if (!productDoc.lastActivityAt) {
      productDoc.lastActivityAt = now;
    }

    group.products = [...existing, productDoc];
    group.markModified('products');

    const changed = recalculateProductRanks(group);
    if (changed) {
      group.updatedAt = new Date();
    }
    await group.save();

    await populateProductCreators(group);
    const response = composeProductResponse(group, req.userId);
    const created = response.products.find((product) => product.id === String(productDoc._id));

    res.status(201).json({
      success: true,
      message: 'Product suggested successfully',
      product: created,
      metrics: response.metrics
    });
  } catch (err) {
    console.error('Error in suggestProduct:', err);
    res.status(500).json({
      success: false,
      message: 'Error suggesting product',
      error: err.message
    });
  }
};

/**
 * Vote on a product
 */
exports.voteOnProduct = async (req, res) => {
  try {
    const { id: groupId, productId } = req.params;
    const { vote } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    if (!isGroupMember(group, req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only group members can vote'
      });
    }

    const validVotes = ['up', 'down', 'clear'];
    if (!validVotes.includes(vote)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vote value'
      });
    }

    const { product, index } = findProductById(group, productId);
    if (!product || index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const userIdStr = String(req.userId);
    const upvoters = new Set(product.upvoters?.map(String) || []);
    const downvoters = new Set(product.downvoters?.map(String) || []);

    if (vote === 'clear') {
      upvoters.delete(userIdStr);
      downvoters.delete(userIdStr);
    } else if (vote === 'up') {
      upvoters.add(userIdStr);
      downvoters.delete(userIdStr);
    } else if (vote === 'down') {
      downvoters.add(userIdStr);
      upvoters.delete(userIdStr);
    }

    group.products[index].upvoters = Array.from(upvoters);
    group.products[index].downvoters = Array.from(downvoters);
    group.products[index].lastActivityAt = new Date();
    group.products[index].updatedAt = new Date();
    group.products[index].lastUpdatedBy = req.userId;

    const changed = recalculateProductRanks(group);
    if (changed) {
      group.updatedAt = new Date();
    }
    await group.save();

    await populateProductCreators(group);
    const response = composeProductResponse(group, req.userId);
    const updated = response.products.find((product) => product.id === String(productId));

    res.json({
      success: true,
      message: 'Vote recorded',
      product: updated,
      metrics: response.metrics
    });
  } catch (err) {
    console.error('Error in voteOnProduct:', err);
    res.status(500).json({
      success: false,
      message: 'Error recording vote',
      error: err.message
    });
  }
};

/**
 * Update product status (pin/unpin or admin adjustments)
 */
exports.updateProductStatus = async (req, res) => {
  try {
    const { id: groupId, productId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    if (!isGroupAdmin(group, req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update product status'
      });
    }

    const { product, index } = findProductById(group, productId);
    if (!product || index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const editableFields = [
      'name',
      'note',
      'imageUrl',
      'productUrl',
      'vendor',
      'unitSize',
      'unitName',
      'caseSize',
      'quantity',
      'totalUnits',
      'casePrice',
      'unitPrice',
      'purchaseNotes',
      'availabilityNote',
      'isPreset',
      'statusLocked'
    ];

    const changedByPayload = applyProductDetails(group.products[index], req.body, {
      userId: req.userId,
      allowedFields: editableFields,
      allowStatusUpdates: true
    });

    const now = new Date();
    group.products[index].lastActivityAt = now;
    group.products[index].updatedAt = now;
    group.products[index].lastUpdatedBy = req.userId;

    const changed = recalculateProductRanks(group);
    if (changed || changedByPayload) {
      group.updatedAt = new Date();
    }
    await group.save();

    await populateProductCreators(group);
    const response = composeProductResponse(group, req.userId);
    const updated = response.products.find((item) => item.id === String(productId));

    res.json({
      success: true,
      message: 'Product status updated',
      product: updated,
      metrics: response.metrics
    });
  } catch (err) {
    console.error('Error in updateProductStatus:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating product status',
      error: err.message
    });
  }
};

/**
 * Remove a product (admin only)
 */
exports.removeProduct = async (req, res) => {
  try {
    const { id: groupId, productId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    if (!isGroupAdmin(group, req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can remove products'
      });
    }

    const { product, index } = findProductById(group, productId);
    if (!product || index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const updatedProducts = [...group.products];
    updatedProducts.splice(index, 1);
    group.products = updatedProducts;
    group.markModified('products');

    const changed = recalculateProductRanks(group);
    if (changed) {
      group.updatedAt = new Date();
    }
    await group.save();

    await populateProductCreators(group);
    const response = composeProductResponse(group, req.userId);

    res.json({
      success: true,
      message: 'Product removed successfully',
      metrics: response.metrics,
      products: response.products
    });
  } catch (err) {
    console.error('Error in removeProduct:', err);
    res.status(500).json({
      success: false,
      message: 'Error removing product',
      error: err.message
    });
  }
};

/**
 * Get all groups with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getAllGroups = async (req, res) => {
  try {
    console.log('Fetching groups with filters:', req.query);
    
    // Build query based on filters
    const query = {};
    
    if (req.query.category) {
      query.category = req.query.category;
    }
    
    if (req.query.city) {
      query['location.city'] = new RegExp(req.query.city, 'i');
    }
    
    if (req.query.state) {
      query['location.state'] = new RegExp(req.query.state, 'i');
    }
    
    if (req.query.zipCode) {
      query['location.zipCode'] = req.query.zipCode;
    }
    
    // Get groups with populated user data
    const groups = await Group.find(query)
      .populate('createdBy', 'username')
      .populate('members', 'username')
      .populate('admins', 'username')
      .sort({ createdAt: -1 });
    
    console.log(`Found ${groups.length} groups`);
    
    // Populate group data with membership info if user is authenticated
    const groupsWithMeta = await Promise.all(
      groups.map(group => populateGroupData(group, req.userId))
    );
    
    res.json({
      success: true,
      groups: groupsWithMeta
    });
  } catch (err) {
    console.error('Error in getAllGroups:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching groups',
      error: err.message
    });
  }
};

/**
 * Get group by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getGroupById = async (req, res) => {
  try {
    console.log('Fetching group by ID:', req.params.id);
    
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      console.log('Group not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    const populated = await populateGroupData(group, req.userId);
    console.log('Group found:', group._id);
    res.json({
      success: true,
      group: populated
    });
  } catch (err) {
    console.error('Error in getGroupById:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching group',
      error: err.message
    });
  }
};

/**
 * Update group by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateGroup = async (req, res) => {
  try {
    console.log('Updating group:', req.params.id);
    console.log('Update data:', JSON.stringify(req.body, null, 2));

    const group = await Group.findById(req.params.id);
    
    if (!group) {
      console.log('Group not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if user is admin
    if (!group.admins.includes(req.userId)) {
      console.log('User not authorized to update group:', req.userId);
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this group'
      });
    }

    const payload = {
      ...req.body,
      maxActiveProducts: req.body.maxActiveProducts !== undefined
        ? parseMaxActiveProducts(req.body.maxActiveProducts, group.maxActiveProducts)
        : group.maxActiveProducts,
      rules: req.body.rules !== undefined ? normalizeRules(req.body.rules) : group.rules,
      orderBySchedule: req.body.orderBySchedule !== undefined || req.body.orderByDay !== undefined || req.body.orderByTime !== undefined
        ? normalizeSchedule(req.body.orderBySchedule || {
            day: req.body.orderByDay,
            time: req.body.orderByTime
          })
        : group.orderBySchedule,
      deliverySchedule: req.body.deliverySchedule !== undefined || req.body.deliveryDay !== undefined || req.body.deliveryTime !== undefined
        ? normalizeSchedule(req.body.deliverySchedule || {
            day: req.body.deliveryDay,
            time: req.body.deliveryTime
          })
        : group.deliverySchedule
    };

    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );

    if (updatedGroup) {
      const changed = recalculateProductRanks(updatedGroup);
      if (changed) {
        await updatedGroup.save();
      }
    }

    console.log('Group updated successfully:', updatedGroup._id);
    res.json({
      success: true,
      message: 'Group updated successfully',
      group: await populateGroupData(updatedGroup, req.userId)
    });
  } catch (err) {
    console.error('Error in updateGroup:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(err.errors).map(error => error.message)
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating group',
      error: err.message
    });
  }
};

/**
 * Delete group by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteGroup = async (req, res) => {
  try {
    console.log('Deleting group:', req.params.id);
    
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      console.log('Group not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if user is admin
    if (!group.admins.includes(req.userId)) {
      console.log('User not authorized to delete group:', req.userId);
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this group'
      });
    }

    // Remove group from all members' groups arrays
    await User.updateMany(
      { groups: group._id },
      { $pull: { groups: group._id, adminGroups: group._id } }
    );

    await Group.findByIdAndDelete(req.params.id);
    console.log('Group deleted successfully');
    
    res.json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (err) {
    console.error('Error in deleteGroup:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting group',
      error: err.message
    });
  }
};

/**
 * Join a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.joinGroup = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    console.log(`User ${req.userId} attempting to join group ${groupId}`);
    
    // Find the group and user
    const [group, user] = await Promise.all([
      Group.findById(groupId),
      User.findById(req.userId)
    ]);
    
    // Validate group and user exist
    if (!group || !user) {
      return res.status(404).json({
        success: false,
        message: !group ? 'Group not found' : 'User not found'
      });
    }
    
    // Check if already a member
    if (user.isMemberOfGroup(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Already a member of this group'
      });
    }
    
    // Join group and update both user and group
    await Promise.all([
      user.joinGroup(groupId),
      Group.findByIdAndUpdate(groupId, { $addToSet: { members: req.userId } })
    ]);
    
    // Return updated group data
    const updatedGroup = await populateGroupData(group, req.userId);
    
    res.json({
      success: true,
      message: 'Successfully joined the group',
      group: updatedGroup
    });
  } catch (err) {
    console.error('Error in joinGroup:', err);
    res.status(500).json({
      success: false,
      message: 'Error joining group',
      error: err.message
    });
  }
};

/**
 * Leave a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.leaveGroup = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    console.log(`User ${req.userId} attempting to leave group ${groupId}`);
    
    // Find the group and user
    const [group, user] = await Promise.all([
      Group.findById(groupId),
      User.findById(req.userId)
    ]);
    
    // Validate group and user exist
    if (!group || !user) {
      return res.status(404).json({
        success: false,
        message: !group ? 'Group not found' : 'User not found'
      });
    }
    
    // Check if a member
    if (!user.isMemberOfGroup(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Not a member of this group'
      });
    }
    
    // Check if last admin
    if (user.isAdminOfGroup(groupId) && group.admins.length === 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot leave group as the last admin. Transfer admin role first.'
      });
    }
    
    // Leave group and update both user and group
    await Promise.all([
      user.leaveGroup(groupId),
      Group.findByIdAndUpdate(groupId, {
        $pull: {
          members: req.userId,
          admins: req.userId
        }
      })
    ]);
    
    res.json({
      success: true,
      message: 'Successfully left the group'
    });
  } catch (err) {
    console.error('Error in leaveGroup:', err);
    res.status(500).json({
      success: false,
      message: 'Error leaving group',
      error: err.message
    });
  }
};

/**
 * Get group members with details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getGroupMembers = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    console.log(`Getting members for group ${groupId}`);
    
    // Find the group
    const group = await Group.findById(groupId)
      .populate('members', 'username email avatar')
      .populate('admins', 'username email avatar');
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Format members with roles
    const members = group.members.map(member => {
      const isAdmin = group.admins.some(admin => admin._id.toString() === member._id.toString());
      return {
        _id: member._id,
        name: member.username,
        email: member.email,
        avatar: member.avatar || null,
        role: isAdmin ? 'admin' : 'member'
      };
    });
    
    res.json({
      success: true,
      members
    });
  } catch (err) {
    console.error('Error in getGroupMembers:', err);
    res.status(500).json({
      success: false,
      message: 'Error getting group members',
      error: err.message
    });
  }
};

/**
 * Invite a user to join the group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.inviteToGroup = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    // Find the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Check if user is admin or creator
    if (!group.admins.includes(req.userId) && group.createdBy.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can invite users'
      });
    }
    
    // Find user by email
    const invitedUser = await User.findOne({ email });
    
    // If user exists, add them to the group
    if (invitedUser) {
      // Check if already a member
      if (invitedUser.isMemberOfGroup(groupId)) {
        return res.status(400).json({
          success: false,
          message: 'User is already a member of this group'
        });
      }
      
      // Add user to group
      await Promise.all([
        invitedUser.joinGroup(groupId),
        Group.findByIdAndUpdate(groupId, { $addToSet: { members: invitedUser._id } })
      ]);
      
      return res.json({
        success: true,
        message: 'User added to the group'
      });
    }
    
    // If user doesn't exist, we would normally send an email invitation
    // For now, just return success message
    res.json({
      success: true,
      message: 'Invitation sent to ' + email
    });
  } catch (err) {
    console.error('Error in inviteToGroup:', err);
    res.status(500).json({
      success: false,
      message: 'Error inviting user to group',
      error: err.message
    });
  }
};

/**
 * Get messages for a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getMessages = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    
    const messages = await GroupMessage.find({ groupId })
      .populate('author', 'username email avatar')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      messages
    });
  } catch (err) {
    console.error('Error in getMessages:', err);
    res.status(500).json({
      success: false,
      message: 'Error getting messages',
      error: err.message
    });
  }
};

/**
 * Add message to discussion board
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.addMessage = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }
    
    // Find the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Check if user is a member
    if (!group.members.includes(req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only group members can post messages'
      });
    }
    
    // Create and save the message
    const newMessage = new GroupMessage({
      content,
      author: req.userId,
      groupId
    });

    const savedMessage = await newMessage.save();
    await savedMessage.populate('author', 'username email avatar');
    
    res.status(201).json({
      success: true,
      message: savedMessage
    });
  } catch (err) {
    console.error('Error in addMessage:', err);
    res.status(500).json({
      success: false,
      message: 'Error adding message',
      error: err.message
    });
  }
};

/**
 * Delete message
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { id: groupId, messageId } = req.params;
    
    // Find the message
    const message = await GroupMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Check if message belongs to the specified group
    if (message.groupId.toString() !== groupId) {
      return res.status(400).json({
        success: false,
        message: 'Message does not belong to this group'
      });
    }
    
    // Check if user is the author or an admin
    const group = await Group.findById(groupId);
    const isAdmin = group.admins.includes(req.userId);
    const isAuthor = message.author.toString() === req.userId;
    
    if (!isAdmin && !isAuthor) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this message'
      });
    }
    
    // Delete the message
    await GroupMessage.findByIdAndDelete(messageId);
    
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (err) {
    console.error('Error in deleteMessage:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting message',
      error: err.message
    });
  }
};

/**
 * Get events for a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getEvents = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    
    const events = await GroupEvent.find({ groupId })
      .populate('createdBy', 'username email')
      .sort({ date: 1 });
    
    res.json({
      success: true,
      events
    });
  } catch (err) {
    console.error('Error in getEvents:', err);
    res.status(500).json({
      success: false,
      message: 'Error getting events',
      error: err.message
    });
  }
};

/**
 * Create an event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.createEvent = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { title, date, location, description } = req.body;
    
    if (!title || !date) {
      return res.status(400).json({
        success: false,
        message: 'Title and date are required'
      });
    }
    
    // Find the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Check if user is a member
    if (!group.members.includes(req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Only group members can create events'
      });
    }
    
    // Create and save the event
    const newEvent = new GroupEvent({
      title,
      date,
      location: location || '',
      description: description || '',
      createdBy: req.userId,
      groupId
    });
    
    const savedEvent = await newEvent.save();
    await savedEvent.populate('createdBy', 'username email');
    
    res.status(201).json({
      success: true,
      event: savedEvent
    });
  } catch (err) {
    console.error('Error in createEvent:', err);
    res.status(500).json({
      success: false,
      message: 'Error creating event',
      error: err.message
    });
  }
};

/**
 * Update an event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateEvent = async (req, res) => {
  try {
    const { id: groupId, eventId } = req.params;
    
    // Find the event
    const event = await GroupEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    
    // Check if event belongs to the specified group
    if (event.groupId.toString() !== groupId) {
      return res.status(400).json({
        success: false,
        message: 'Event does not belong to this group'
      });
    }
    
    // Check if user is the creator or an admin
    const group = await Group.findById(groupId);
    const isAdmin = group.admins.includes(req.userId);
    const isCreator = event.createdBy.toString() === req.userId;
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this event'
      });
    }
    
    // Update the event
    const updatedEvent = await GroupEvent.findByIdAndUpdate(
      eventId,
      {
        title: req.body.title,
        date: req.body.date,
        location: req.body.location || '',
        description: req.body.description || ''
      },
      { new: true, runValidators: true }
    ).populate('createdBy', 'username email');
    
    res.json({
      success: true,
      event: updatedEvent
    });
  } catch (err) {
    console.error('Error in updateEvent:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating event',
      error: err.message
    });
  }
};

/**
 * Delete an event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteEvent = async (req, res) => {
  try {
    const { id: groupId, eventId } = req.params;
    
    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    
    // Check if event belongs to the specified group
    if (event.groupId.toString() !== groupId) {
      return res.status(400).json({
        success: false,
        message: 'Event does not belong to this group'
      });
    }
    
    // Check if user is the creator or an admin
    const group = await Group.findById(groupId);
    const isAdmin = group.admins.includes(req.userId);
    const isCreator = event.createdBy.toString() === req.userId;
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this event'
      });
    }
    
    // Delete the event
    await GroupEvent.findByIdAndDelete(eventId);
    
    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (err) {
    console.error('Error in deleteEvent:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting event',
      error: err.message
    });
  }
};
