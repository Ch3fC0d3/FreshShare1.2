// Global error handlers to catch any uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error('Error details:', err.name, err.message);
  console.error(err.stack);
  process.exit(1);
});

// (moved lightweight app health route below after app initialization)

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error('Error details:', err.name, err.message);
  console.error(err.stack);
  process.exit(1);
});
const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const dbConfig = require('./config/db.config');
const fs = require('fs');

// Load environment variables from .env file BEFORE requiring auth.config
const dotenv = require('dotenv');
const envPath = path.resolve(__dirname, '.env');
console.log('Loading environment variables from:', envPath);
if (fs.existsSync(envPath)) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error('Error loading .env file:', result.error);
  } else {
    console.log('Successfully loaded environment variables');
    // Log environment variables for debugging
    console.log('Environment variables loaded:');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('USDA_API_KEY present:', process.env.USDA_API_KEY ? 'Yes' : 'No');
    if (process.env.USDA_API_KEY) {
      const keyLength = process.env.USDA_API_KEY.length;
      console.log('USDA_API_KEY length:', keyLength);
      console.log('USDA_API_KEY preview:', `${process.env.USDA_API_KEY.substring(0, 3)}...${process.env.USDA_API_KEY.substring(keyLength - 3)}`);
    } else {
      console.log('WARNING: USDA_API_KEY is not set!');
    }
  }
} else {
  console.error('.env file not found at path:', envPath);
  dotenv.config(); // Fallback to default dotenv behavior
}

// Now that env is loaded, require auth.config
const authConfig = require('./config/auth.config');

const app = express();
// Use dynamic port for cPanel/Passenger, fallback to 3002 for local development
const PORT = process.env.PORT || 3002;

// Ensure templates always have an assetVersion available
app.locals.assetVersion = process.env.ASSET_VERSION || String(Date.now());

// Initialize all routes and middleware first, then start the server
console.log('Initializing routes and middleware first...');

// Middleware - only initialize once
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Security: Content Security Policy (CSP)
// Allow our own scripts/styles/images/fonts and required CDNs. Do NOT allow 'unsafe-eval'.
app.use((req, res, next) => {
  try {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      // Allow WebAssembly execution without enabling general eval
      "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://kit.fontawesome.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com https://ka-f.fontawesome.com",
      // Allow product images from Open Food Facts (free source) and Unsplash (stable photos)
      "img-src 'self' data: blob: https://images.openfoodfacts.org https://static.openfoodfacts.org https://images.unsplash.com https://plus.unsplash.com",
      "font-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.gstatic.com https://ka-f.fontawesome.com data:",
      "connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://ka-f.fontawesome.com",
      // Permit web workers created from blob URLs (needed by some libraries such as Quagga)
      "worker-src 'self' blob:",
      // Back-compat for browsers that still rely on child-src for workers
      "child-src 'self' blob:",
      "frame-ancestors 'self'",
      "form-action 'self'"
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);
  } catch (_) { /* no-op */ }
  next();
});

// Quiet DevTools probe noise: serve empty JSON for Chrome's appspecific check
// This avoids 404s in console when DevTools/Extensions probe this path.
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  try { res.setHeader('Content-Type', 'application/json'); } catch (_) {}
  res.status(200).send('{}');
});

// Ensure 'user' is always defined for views (null by default)
app.use((req, res, next) => {
  if (typeof res.locals.user === 'undefined') {
    res.locals.user = null;
  }
  next();
});

// Asset version for cache-busting static assets in views
app.use((req, res, next) => {
  try {
    if (!global.__ASSET_VERSION) {
      global.__ASSET_VERSION = String(Date.now());
    }
    res.locals.assetVersion = process.env.ASSET_VERSION || global.__ASSET_VERSION;
  } catch (_) {
    res.locals.assetVersion = String(Date.now());
  }
  next();
});

// Feature flags middleware (expose to views)
app.use((req, res, next) => {
  const val = (process.env.UPC_SCANNER_AUTOSTART || '').toLowerCase();
  const enabled = val === '' || val === undefined || ['1', 'true', 'yes', 'on'].includes(val);
  res.locals.featureFlags = {
    scannerAutoStart: enabled
  };
  next();
});

// Token synchronization middleware - ensures tokens in Authorization headers are set as cookies
// Removed token synchronization middleware; rely solely on HttpOnly cookie from login route

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public/uploads/marketplace');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Set up EJS
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/layout');

// Authentication middleware for views
app.use(async (req, res, next) => {
  try {
    // Get token from various sources with better error handling
    let token = null;
    
    // Check cookies first (most common for web pages)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } 
    // Then check authorization header (for API requests)
    else if (req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else {
        token = authHeader;
      }
    } 
    // Finally check query parameter (for special cases like redirects)
    else if (req.query && req.query.token) {
      token = req.query.token;
      
      // If token is in query, set it as a cookie for persistence
      // This helps with redirects that include the token
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        sameSite: 'lax',
        path: '/'
      });
    }

    const mask = (value) => {
      if (!value || typeof value !== 'string') return '(none)';
      if (value.length <= 12) return value;
      return `${value.slice(0, 6)}…${value.slice(-6)}`;
    };

    try {
      console.log(`[globalAuth] ${req.method} ${req.originalUrl}`);
      console.log('[globalAuth] token candidate (pre-check):', mask(token));
    } catch (_) {}

    if (token) {
      try {
        // Verify token using the same secret as in auth.config.js
        console.log('[globalAuth] verifying token with primary secret. Token length:', token.length);
        console.log('[globalAuth] token preview:', mask(token));
        const primarySecret = (authConfig && authConfig.secret) || process.env.JWT_SECRET;
        const legacySecret = process.env.LEGACY_JWT_SECRET;
        let decoded = null;
        try {
          decoded = jwt.verify(token, primarySecret);
        } catch (primaryErr) {
          console.warn('[globalAuth] primary JWT verification failed, attempting legacy secret:', primaryErr && primaryErr.message);
          if (legacySecret) {
            decoded = jwt.verify(token, legacySecret);
            console.log('[globalAuth] legacy JWT secret accepted token');
          } else {
            throw primaryErr;
          }
        }
        const User = require('./models/user.model');
        const user = await User.findById(decoded.id)
          .select('-password')
          .populate('roles', 'name');
        
        if (user) {
          // Normalize document for templates and ensure roles contain names
          const plainUser = user.toObject({ getters: true, virtuals: true });
          plainUser.roles = (plainUser.roles || []).map((role) => {
            if (typeof role === 'string') {
              return role;
            }
            if (role && typeof role === 'object') {
              if (typeof role.name === 'string' && role.name.length > 0) {
                return role.name;
              }
              if (role._id) {
                return String(role._id);
              }
            }
            return '';
          }).filter(Boolean);

          // Add user data to locals for all views
          res.locals.user = plainUser;
          console.log('User authenticated:', user.username, 'ID:', user._id); // Enhanced debug log
          
          // Check if token is close to expiration (less than 24 hours remaining)
          // and renew it if needed
          if (decoded.exp && decoded.exp - (Date.now() / 1000) < 24 * 60 * 60) {
            console.log('Token close to expiration, renewing for user:', user.username);
            
            // Generate new token with fresh expiration (7 days)
            const newToken = jwt.sign({ id: user._id }, (authConfig && authConfig.secret) || process.env.JWT_SECRET, {
              expiresIn: 7 * 24 * 60 * 60 // 7 days
            });
            
            // Set new token as cookie
            res.cookie('token', newToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
              sameSite: 'lax',
              path: '/'
            });
            
            console.log('Token renewed successfully for user:', user.username);
          }
        } else {
          console.log('Token valid but user not found in database');
        }
      } catch (err) {
        console.error('[globalAuth] token verification failed:', err && err.name, err && err.message);
        console.error('[globalAuth] token value (masked):', mask(token));
      }
    } else {
      console.log('No authentication token found');
    }

    try {
      if (res.locals.user) {
        console.log('[globalAuth] locals.user set to:', {
          id: String(res.locals.user._id || ''),
          username: res.locals.user.username || '(no username)',
          roles: Array.isArray(res.locals.user.roles) ? res.locals.user.roles : '(no roles)'
        });
      } else {
        console.log('[globalAuth] locals.user remains null after auth middleware');
      }
    } catch (logErr) {
      console.error('[globalAuth] locals.user logging failed:', logErr && logErr.message);
    }
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    next();
  }
});

// Page Routes - register these AFTER API routes

// Page Routes
app.get('/', (req, res) => {
  res.render('pages/index', { 
    title: 'FreshShare - Home'
  });
});

app.get('/marketplace', async (req, res) => {
  try {
    // Fetch listings from the database
    const db = require('./models');
    const Listing = db.listing;

    // Extract query params (support arrays for categories)
    const {
      category: rawCategory,
      minPrice: rawMinPrice,
      maxPrice: rawMaxPrice,
      isOrganic: rawOrganic,
      sortBy: rawSort = 'latest',
      search: rawSearch
    } = req.query || {};

    const selectedCategories = Array.isArray(rawCategory)
      ? rawCategory
      : (typeof rawCategory === 'string' && rawCategory.trim() !== '')
        ? rawCategory.split(',')
        : [];
    const normalizedCategories = selectedCategories
      .map(cat => String(cat).trim())
      .filter(Boolean);

    const minPriceNum = rawMinPrice !== undefined && rawMinPrice !== '' ? Number(rawMinPrice) : NaN;
    const maxPriceNum = rawMaxPrice !== undefined && rawMaxPrice !== '' ? Number(rawMaxPrice) : NaN;
    const sortBy = rawSort || 'latest';
    const search = typeof rawSearch === 'string' ? rawSearch.trim() : '';
    const organicSelected = rawOrganic !== undefined && !(rawOrganic === 'false' || rawOrganic === '0');

    // Build filter object
    const filter = {};

    if (normalizedCategories.length === 1) {
      filter.category = normalizedCategories[0];
    } else if (normalizedCategories.length > 1) {
      filter.category = { $in: normalizedCategories };
    }

    if (rawOrganic !== undefined) {
      filter.isOrganic = organicSelected;
    }

    if (!Number.isNaN(minPriceNum) || !Number.isNaN(maxPriceNum)) {
      filter.price = {};
      if (!Number.isNaN(minPriceNum)) filter.price.$gte = minPriceNum;
      if (!Number.isNaN(maxPriceNum)) filter.price.$lte = maxPriceNum;
    }

    // Add text search if search parameter is provided
    if (search) {
      filter.$text = { $search: search };
    }

    // Restrict to user's active groups if logged in
    try {
      const u = res.locals.user;
      if (u && Array.isArray(u.groups)) {
        const activeGroupIds = u.groups
          .filter(m => m && m.status === 'active' && m.group)
          .map(m => String(m.group));
        if (activeGroupIds.length > 0) {
          filter.group = { $in: activeGroupIds };
        } else {
          // No active groups: render an empty marketplace for this user
          return res.render('pages/marketplace', { 
            title: 'FreshShare - Marketplace',
            listings: [],
            filters: { category, minPrice, maxPrice, isOrganic, sortBy, search }
          });
        }
      }
    } catch (_) {}
    
    // Build sort object
    let sort = { createdAt: -1 }; // Default sort by newest

    if (sortBy === 'price-asc') sort = { price: 1 };
    if (sortBy === 'price-desc') sort = { price: -1 };
    
    // Execute query
    const listings = await Listing.find(filter)
      .sort(sort)
      .limit(12) // Limit to 12 listings for the page
      .populate('seller', 'username profileImage');
    
    // Render the marketplace page with the listings
    res.render('pages/marketplace', { 
      title: 'FreshShare - Marketplace',
      listings: listings || [],
      filters: {
        category: normalizedCategories,
        minPrice: !Number.isNaN(minPriceNum) ? String(minPriceNum) : '',
        maxPrice: !Number.isNaN(maxPriceNum) ? String(maxPriceNum) : '',
        isOrganic: rawOrganic !== undefined ? organicSelected : false,
        sortBy,
        search
      }
    });
  } catch (error) {
    console.error('Error fetching marketplace listings:', error);
    // Render the page with an empty listings array if there's an error
    res.render('pages/marketplace', { 
      title: 'FreshShare - Marketplace',
      listings: [],
      filters: {},
      error: 'Failed to load marketplace listings'
    });
  }
});

app.get('/create-listing', (req, res) => {
  res.render('pages/create-listing', { 
    title: 'FreshShare - Create Listing'
  });
});

// Listing Details page
app.get('/listings/:id', async (req, res) => {
  try {
    const db = require('./models');
    const Listing = db.listing;
    const listing = await Listing.findById(req.params.id).populate('seller', 'username profileImage');
    if (!listing) {
      return res.status(404).render('error', { title: 'Not Found', message: 'Listing not found' });
    }
    return res.render('pages/listing-details', {
      title: `FreshShare - ${listing.title || 'Listing'}`,
      listing
    });
  } catch (err) {
    console.error('Listing details page error:', err);
    return res.status(500).render('error', { title: 'Error', message: 'Failed to load listing details page' });
  }
});

app.get('/forum', (req, res) => {
  res.render('pages/forum', { 
    title: 'FreshShare - Forum'
  });
});

app.get('/groups', (req, res) => {
  res.render('pages/groups', { 
    title: 'FreshShare - Groups'
  });
});

app.get('/create-group', (req, res) => {
  res.render('pages/create-group', { 
    title: 'FreshShare - Create New Group'
  });
});

app.get('/group-details', (req, res) => {
  res.render('pages/group-details', { 
    title: 'FreshShare - Group Details',
    groupId: req.query.id
  });
});

app.get('/groups/:id/edit', async (req, res) => {
  try {
    const redirectPath = `/groups/${req.params.id}/edit`;
    if (!res.locals.user) {
      return res.redirect('/login?redirect=' + encodeURIComponent(redirectPath));
    }

    const Group = require('./models/group.model');
    const group = await Group.findById(req.params.id).select('admins createdBy');

    if (!group) {
      return res.status(404).render('error', { title: 'Not Found', message: 'Group not found' });
    }

    const userId = String(res.locals.user._id);
    const isAdmin = String(group.createdBy) === userId || group.admins.some((admin) => String(admin) === userId);

    if (!isAdmin) {
      return res.status(403).render('error', {
        title: 'Forbidden',
        message: 'You are not authorized to edit this group.'
      });
    }

    return res.render('pages/edit-group', {
      title: 'FreshShare - Edit Group',
      groupId: req.params.id
    });
  } catch (err) {
    console.error('Edit group page error:', err);
    return res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load edit group page'
    });
  }
});

app.get('/groups/:id/shopping', (req, res) => {
  res.render('pages/group_shopping', { 
    title: 'FreshShare - Group Shopping',
    groupId: req.params.id
  });
});

app.get('/groups/:id/orders', (req, res) => {
  res.render('pages/group_orders', { 
    title: 'FreshShare - Group Orders',
    groupId: req.params.id
  });
});

// Edit Listing page with ownership check
app.get('/listings/:id/edit', async (req, res) => {
  try {
    if (!res.locals.user) {
      return res.redirect('/login?redirect=' + encodeURIComponent(`/listings/${req.params.id}/edit`));
    }
    const db = require('./models');
    const Listing = db.listing;
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).render('error', { title: 'Not Found', message: 'Listing not found' });
    }
    if (String(listing.seller) !== String(res.locals.user._id)) {
      return res.status(403).render('error', { title: 'Forbidden', message: 'You are not authorized to edit this listing' });
    }
    return res.render('pages/edit-listing', {
      title: 'FreshShare - Edit Listing',
      listingId: req.params.id
    });
  } catch (err) {
    console.error('Edit listing page error:', err);
    return res.status(500).render('error', { title: 'Error', message: 'Failed to load edit listing page' });
  }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const QuickOrder = require('./models/quick-order.model');
    const id = req.params.id;
    const order = await QuickOrder.findById(id).lean();
    if (!order) {
      return res.status(404).render('error', { title: 'Order Not Found', message: 'The order you are looking for does not exist.' });
    }
    return res.render('pages/order-details', {
      title: 'FreshShare - Order Details',
      order
    });
  } catch (e) {
    console.error('Order details error:', e);
    return res.status(500).render('error', { title: 'Error', message: 'Failed to load order details' });
  }
});

// Quick Order confirmation page
app.get('/orders/confirm/:id', async (req, res) => {
  try {
    const QuickOrder = require('./models/quick-order.model');
    const Listing = require('./models/listing.model');
    const User = require('./models/user.model');
    const id = req.params.id;
    const order = await QuickOrder.findById(id).lean();
    if (!order) {
      return res.status(404).render('error', { title: 'Order Not Found', message: 'The order you are looking for does not exist.' });
    }
    // Derive seller contact info for the items in the order
    let sellers = [];
    try {
      const listingIds = (order.items || []).map(it => it.listingId).filter(Boolean);
      if (listingIds.length) {
        const listings = await Listing.find({ _id: { $in: listingIds } }).select('seller title').lean();
        const sellerIds = Array.from(new Set(listings.map(l => String(l.seller)).filter(Boolean)));
        if (sellerIds.length) {
          const users = await User.find({ _id: { $in: sellerIds } }).select('username email phoneNumber').lean();
          sellers = users.map(u => ({ id: String(u._id), name: u.username, email: u.email || '', phone: u.phoneNumber || '' }));
        }
      }
    } catch (_) {}
    return res.render('pages/order-confirmation', {
      title: 'FreshShare - Order Confirmation',
      order,
      sellers
    });
  } catch (e) {
    console.error('Order confirmation error:', e);
    return res.status(500).render('error', { title: 'Error', message: 'Failed to load order confirmation page' });
  }
});

app.get('/about', (req, res) => {
  res.render('pages/about', { 
    title: 'FreshShare - About'
  });
});

app.get('/contact', (req, res) => {
  res.render('pages/contact', { 
    title: 'FreshShare - Contact'
  });
});

// Checkout page
app.get('/checkout', (req, res) => {
  try {
    if (!res.locals.user) {
      return res.redirect('/login?redirect=' + encodeURIComponent('/checkout'));
    }
    const u = res.locals.user || {};
    const prefill = {
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || '',
      email: u.email || '',
      phone: u.phoneNumber || '',
      street: (u.location && u.location.street) || '',
      city: (u.location && u.location.city) || '',
      state: (u.location && u.location.state) || '',
      zip: (u.location && (u.location.zip || u.location.zipCode)) || ''
    };
    res.render('pages/checkout', {
      title: 'FreshShare - Checkout',
      prefill
    });
  } catch (e) {
    console.error('Checkout route error:', e);
    res.status(500).render('error', { title: 'Error', message: 'Failed to load checkout page' });
  }
});

app.get('/profile', async (req, res) => {
  try {
    // Check if user is logged in
    if (!res.locals.user) {
      console.log('Profile access attempted without authentication, redirecting to login');
      return res.redirect('/login?redirect=/profile&error=' + encodeURIComponent('Please log in to view your profile'));
    }

    // User is logged in, use their data
    const userData = res.locals.user;
    console.log(`Rendering profile page for user: ${userData.username} (${userData._id})`);

    // Add debug information
    console.log('User data available:', {
      id: userData._id,
      username: userData.username,
      email: userData.email
    });

    // Ensure userData is properly formatted for the template
    const formattedUserData = {
      _id: userData._id,
      username: userData.username,
      email: userData.email,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      profileImage: userData.profileImage || '/assets/images/avatar-placeholder.jpg',
      location: {
        street: userData.location?.street || '',
        city: userData.location?.city || '',
        state: userData.location?.state || '',
        zipCode: userData.location?.zipCode || ''
      },
      phoneNumber: userData.phoneNumber || ''
    };

    // Recent Quick Orders for this user
    let recentOrders = [];
    try {
      const QuickOrder = require('./models/quick-order.model');
      recentOrders = await QuickOrder.find({ user: userData._id }).sort({ createdAt: -1 }).limit(10).lean();
    } catch (e) {
      console.warn('Failed to fetch recent orders for profile:', e && e.message);
    }

    // Render the profile page with the user data
    res.render('pages/profile', {
      title: 'FreshShare - Profile',
      user: formattedUserData,
      recentOrders
    });
  } catch (error) {
    console.error('Profile page error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load profile page: ' + error.message
    });
  }
});

app.get('/profile-edit', async (req, res) => {
  try {
    // Check if user is logged in
    if (!res.locals.user) {
      return res.redirect('/login');
    }
    
    // Use the user data from locals
    const userData = res.locals.user;

    res.render('pages/profile-edit', {
      title: 'FreshShare - Edit Profile',
      user: userData
    });
  } catch (error) {
    console.error('Profile edit page error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load profile edit page'
    });
  }
});

app.get('/dashboard', (req, res) => {
  // Check if user is logged in
  if (!res.locals.user) {
    console.log('User not authenticated, redirecting to login with noRedirect flag');
    return res.redirect('/login?noRedirect=true');
  }
  
  console.log('User authenticated, rendering dashboard');
  res.render('pages/dashboard', { 
    title: 'FreshShare - Dashboard'
  });
});

// Manage Vendors page
app.get('/vendors', (req, res) => {
  if (!res.locals.user) {
    return res.redirect('/login?redirect=/vendors');
  }
  res.render('pages/vendors', {
    title: 'FreshShare - Vendors',
    query: req.query || {}
  });
});

// Admin page (Webmaster)
app.get('/admin', async (req, res) => {
  try {
    if (!res.locals.user) {
      return res.redirect('/login?redirect=/admin');
    }
    // Compute admin role id once
    const Role = require('./models/role.model');
    const User = require('./models/user.model');
    const r = await Role.findOne({ name: 'admin' }).select('_id').lean();
    const adminRoleId = r ? String(r._id) : null;
    const me = await User.findById(res.locals.user._id).select('roles username').lean();
    const hasAdmin = !!(adminRoleId && me && Array.isArray(me.roles) && me.roles.map(String).includes(adminRoleId));
    if (!hasAdmin) {
      return res.status(403).render('error', { title: 'Forbidden', message: 'You do not have access to the admin dashboard.' });
    }
    return res.render('pages/admin', { title: 'FreshShare - Admin', currentUserId: String(res.locals.user._id) });
  } catch (e) {
    console.error('Admin page error:', e && e.message);
    return res.status(500).render('error', { title: 'Error', message: 'Failed to load admin page' });
  }
});
// Messages page
app.get('/messages', (req, res) => {
  if (!res.locals.user) {
    return res.redirect('/login?redirect=/messages');
  }
  res.render('pages/messages', {
    title: 'FreshShare - Messages'
  });
});

app.get('/login', (req, res) => {
  // COMPLETELY DISABLE REDIRECTS to break the infinite loop
  console.log('Rendering login page without any redirects');
  
  // Always render the login page regardless of authentication status
  res.render('pages/login', { 
    title: 'FreshShare - Login'
  });
});

app.get('/signup', (req, res) => {
  if (res.locals.user) {
    return res.redirect('/dashboard');
  }
  res.render('pages/signup', { 
    title: 'FreshShare - Sign Up'
  });
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

console.log('All routes initialized successfully');

// Register API routes
const marketplaceApiRoutes = require('./routes/api/marketplace');
app.use('/api/marketplace', marketplaceApiRoutes);

// Groups API routes
const groupApiRoutes = require('./routes/groups.routes');
const authJwt = require('./middleware/authJwt');
app.use('/api/groups', authJwt.verifyToken, groupApiRoutes);

// Dashboard API routes
try {
  const dashboardApiRoutes = require('./routes/api/dashboard');
  app.use('/api/dashboard', authJwt.verifyToken, dashboardApiRoutes);
  console.log('Dashboard API mounted at /api/dashboard');
} catch (e) {
  console.error('Failed to mount /api/dashboard:', e && e.message);
}

// Admin API routes
try {
  const adminApiRoutes = require('./routes/api/admin');
  app.use('/api/admin', authJwt.verifyToken, adminApiRoutes);
  console.log('Admin API mounted at /api/admin');
} catch (e) {
  console.error('Failed to mount /api/admin:', e && e.message);
}
// Messages API routes
try {
  const messagesApiRoutes = require('./routes/api/messages');
  app.use('/api/messages', authJwt.verifyToken, messagesApiRoutes);
  console.log('Messages API mounted at /api/messages');
} catch (e) {
  console.error('Failed to mount /api/messages:', e && e.message);
}

// Orders API routes (quick checkout)
try {
  const ordersApiRoutes = require('./routes/api/orders');
  app.use('/api/orders', ordersApiRoutes);
  console.log('Orders API mounted at /api/orders');
} catch (e) {
  console.error('Failed to mount /api/orders:', e && e.message);
}

// Forum API routes
try {
  const forumApiRoutes = require('./routes/api/forum');
  app.use('/api/forum', forumApiRoutes);
  console.log('Forum API mounted at /api/forum');
} catch (e) {
  console.error('Failed to mount /api/forum:', e && e.message);
}

// Auth routes (pages + API)
const authRoutes = require('./routes/auth.routes');
app.use('/', authRoutes);

// Fallback: ensure critical auth API routes are available
try {
  const authController = require('./controllers/auth.controller');
  app.post('/api/auth/login', authController.login);
  app.post('/api/auth/signup', authController.signup);
} catch (e) {
  console.error('Failed to wire fallback auth routes:', e && e.message);
}

console.log('API routes available:');
console.log('- /api/marketplace/upc/:upc - UPC lookup endpoint');
console.log('- /api/marketplace/upc-test/:upc - UPC test endpoint');
console.log('- /api/groups - Groups API (create, list, manage)');
console.log('- /api/auth/login - Login endpoint');
console.log('- /api/auth/signup - Signup endpoint');

// Simple API root summary
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    name: 'FreshShare API',
    version: '1.0.0',
    endpoints: [
      { method: 'GET', path: '/api/marketplace', description: 'List marketplace listings (query filters supported)' },
      { method: 'POST', path: '/api/marketplace', description: 'Create listing' },
      { method: 'GET', path: '/api/marketplace/:id', description: 'Get listing by id' },
      { method: 'PUT', path: '/api/marketplace/:id', description: 'Update listing' },
      { method: 'DELETE', path: '/api/marketplace/:id', description: 'Delete listing' },
      { method: 'GET', path: '/api/marketplace/:id/groupbuy/status', description: 'Group buy status' },
      { method: 'GET', path: '/api/marketplace/:id/pieces/status', description: 'Per-piece status' },
      { method: 'GET', path: '/api/groups', description: 'List groups (auth required)' },
      { method: 'POST', path: '/api/groups', description: 'Create group (auth required)' },
      { method: 'POST', path: '/api/auth/login', description: 'Login' },
      { method: 'POST', path: '/api/auth/signup', description: 'Signup' },
      { method: 'GET', path: '/api/health/db', description: 'DB health' }
    ]
  });
});

// Simple health endpoint for MongoDB connection status
app.get('/api/health/db', async (req, res) => {
  try {
    const state = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    const stateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    let pingOk = false;
    try {
      // If connected, try a quick ping using admin command
      if (state === 1) {
        await mongoose.connection.db.admin().ping();
        pingOk = true;
      }
    } catch (e) {
      pingOk = false;
    }
    res.status(200).json({
      success: true,
      connected: state === 1,
      state: stateMap[state] || String(state),
      ping: pingOk
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err && err.message });
  }
});

// Lightweight app health (no DB dependency)
app.get('/api/health/status', (req, res) => {
  try {
    res.status(200).json({
      success: true,
      name: 'FreshShare',
      version: '1.0.0',
      node: process.version,
      uptimeSec: Math.floor(process.uptime()),
      env: process.env.NODE_ENV || 'development',
      port: PORT
    });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

let mongod = null; // Reserved for potential in-memory usage (not used by default)

/**
 * Initializes the database with default roles if they don't exist.
 */
async function initializeDatabase() {
  const db = require('./models');
  const Role = db.role;
  const count = await Role.estimatedDocumentCount();
  if (count === 0) {
    await Promise.all([
      new Role({ name: 'user' }).save(),
      new Role({ name: 'moderator' }).save(),
      new Role({ name: 'admin' }).save(),
    ]);
    console.log('✅ Added roles to database');
  }
}

/**
 * Starts the Express server on the configured port.
 */
function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`✅ SUCCESS: Server is running on port ${PORT}`);
    console.log(`API endpoints available at http://localhost:${PORT}/api/`);
    console.log(`✅ Dashboard available at http://localhost:${PORT}/dashboard`);
    console.log('=========================================');
  });

  server.on('error', (error) => {
    console.error(`❌ SERVER ERROR: ${error.message}`);
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    }
    // In the new flow, a server error should cause a shutdown
    shutdown('SERVER_ERROR');
  });
}

/**
 * Connects to the MongoDB database with retry logic for production.
 * @param {string} mongoUri - The URI for the MongoDB connection.
 */
async function connectToDatabase(mongoUri) {
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Short timeout for faster feedback
    });

    console.log('✅ Successfully connected to MongoDB!');
    
    // Initialize database roles and start the server
    await initializeDatabase();
    startServer();

  } catch (err) {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    
    // For development with an in-memory server, failure is fatal.
    if (process.env.NODE_ENV === 'development') {
      console.error('Could not connect to in-memory database. Exiting.');
      await shutdown('DB_CONN_FAIL');
    } else {
      // For other environments, retry the connection.
      console.log('Retrying connection in 5 seconds...');
      setTimeout(() => connectToDatabase(mongoUri), 5000);
    }
  }
}

/**
 * Main function to orchestrate application startup.
 */
async function main() {
  // Choose Mongo URI
  const envUri = process.env.MONGODB_URI && process.env.MONGODB_URI.trim();
  let mongoUri = envUri;

  if (!mongoUri) {
    // Build local Mongo URI from db.config.js
    const host = dbConfig.HOST || '127.0.0.1';
    const port = dbConfig.PORT || 27017;
    const dbName = dbConfig.DB || 'freshshare_db';
    mongoUri = `mongodb://${host}:${port}/${dbName}`;
    console.log(`Using local MongoDB at ${mongoUri}`);
  } else {
    console.log('Using MongoDB URI from environment.');
  }

  // Start the connection process
  await connectToDatabase(mongoUri);
}

/**
 * Gracefully shuts down the application.
 * @param {string} signal - The signal or reason for the shutdown.
 */
async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    if (mongod) {
      await mongod.stop();
      console.log('In-memory MongoDB server stopped.');
    }
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the application only when executed directly, and not during tests
if (require.main === module) {
  if (process.env.NODE_ENV !== 'test') {
    main();
  }
} else {
  module.exports = app;
}
