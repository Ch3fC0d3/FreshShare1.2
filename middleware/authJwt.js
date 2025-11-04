const jwt = require('jsonwebtoken');
const db = require('../models');
const authConfig = require('../config/auth.config');
const User = db.user;

// Retrieve JWT secret from shared auth config
const JWT_SECRET = authConfig.secret;
const LEGACY_JWT_SECRET = process.env.LEGACY_JWT_SECRET;

const maskToken = (token) => {
  if (!token || typeof token !== 'string') return '(none)';
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}…${token.slice(-6)}`;
};

const formatAuthHeader = (headerValue) => {
  if (!headerValue || typeof headerValue !== 'string') return '(none)';
  const parts = headerValue.split(' ');
  if (parts.length < 2) {
    return maskToken(headerValue);
  }
  const [scheme, value] = parts;
  return `${scheme} ${maskToken(value)}`;
};

/**
 * Verify JWT token from request headers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} - Continues to next middleware or returns error response
 */
const verifyToken = (req, res, next) => {
  // Get token from request headers (case-insensitive) or cookies
  const getHeaderCaseInsensitive = (headers, headerName) => {
    const headerKeys = Object.keys(headers);
    const key = headerKeys.find(k => k.toLowerCase() === headerName.toLowerCase());
    return key ? headers[key] : null;
  };
  
  // Enhanced token extraction with detailed logging
  let token = null;
  const cookieToken = req.cookies && req.cookies.token;
  const authHeaderValue = getHeaderCaseInsensitive(req.headers, 'authorization');

  try {
    console.log(`[authJwt] ${req.method} ${req.originalUrl}`);
    console.log('[authJwt] has cookie-parser:', !!req.cookies);
    console.log('[authJwt] cookies.token:', maskToken(cookieToken));
    console.log('[authJwt] Authorization header:', formatAuthHeader(authHeaderValue));
    console.log('[authJwt] Referer:', req.headers && req.headers.referer ? req.headers.referer : '(none)');
    console.log('[authJwt] Origin:', req.headers && req.headers.origin ? req.headers.origin : '(none)');
  } catch (logErr) {
    try { console.error('[authJwt] logging error:', logErr); } catch (_) {}
  }
  
  // Check cookies first (preferred method for web pages)
  if (cookieToken) {
    token = cookieToken;
    console.log(`Token found in cookies for ${req.method} ${req.originalUrl}`);
  } 
  // Then check authorization header (for API calls)
  else if (authHeaderValue) {
    const authHeader = authHeaderValue;
    console.log(`Raw Authorization header: ${authHeader}`);
    
    // IMPORTANT: Always extract token properly regardless of format
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
      console.log('Bearer prefix found, extracted token after prefix');
    } else {
      token = authHeader.trim();
      console.log('No Bearer prefix found, using header value as is');
    }
    
    console.log(`Token found in Authorization header for ${req.method} ${req.originalUrl}`);
    console.log(`Token extracted (first 15 chars): ${token.substring(0, 15)}...`);
    console.log(`Token length: ${token.length}`);
    console.log(`JWT Secret first 5 chars: ${JWT_SECRET.substring(0, 5)}...`);
    
    // If token is valid, set it as a cookie for future requests
    try {
      // Verify token before setting cookie
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) {
        // Set token as cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
          sameSite: 'lax',
          path: '/'
        });
        console.log(`Set token cookie from Authorization header for user ID: ${decoded.id}`);
      }
    } catch (err) {
      console.error('Error verifying token from Authorization header:', err.message);
      // Continue with normal flow, don't set cookie for invalid token
    }
  } 
  // Finally check x-access-token (legacy support)
  else if (getHeaderCaseInsensitive(req.headers, 'x-access-token')) {
    token = getHeaderCaseInsensitive(req.headers, 'x-access-token');
    console.log(`Token found in x-access-token header for ${req.method} ${req.originalUrl}`);
    
    // If token is valid, set it as a cookie for future requests
    try {
      // Verify token before setting cookie
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) {
        // Set token as cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
          sameSite: 'lax',
          path: '/'
        });
        console.log(`Set token cookie from x-access-token header for user ID: ${decoded.id}`);
      }
    } catch (err) {
      console.error('Error verifying token from x-access-token header:', err.message);
      // Continue with normal flow, don't set cookie for invalid token
    }
  }
  
  // Make authentication optional for the groups API
  if (req.originalUrl === '/api/groups' && req.method === 'GET') {
    if (!token) {
      // For public access to groups, continue without setting userId
      return next();
    }
  }
  
  // If no token for protected routes, return error
  if (!token) {
    console.log(`No token found for ${req.method} ${req.originalUrl}`);
    
    // For API routes, return JSON error
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({
        success: false,
        message: 'No token provided!'
      });
    }
    
    // For web routes, redirect to login
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  
  // Remove Bearer prefix if present
  const tokenValue = token.startsWith('Bearer ') ? token.slice(7) : token;
  
  let decoded = null;
  try {
    console.log('Attempting to verify token with primary JWT secret');
    console.log('Token length:', tokenValue.length);
    console.log('Token first 15 chars:', tokenValue.substring(0, 15) + '...');
    console.log('JWT_SECRET first 10 chars:', JWT_SECRET.substring(0, 10) + '...');
    
    decoded = jwt.verify(tokenValue, JWT_SECRET);
    console.log('Token successfully verified with primary JWT secret');
    console.log('Decoded token user ID:', decoded.id);
  } catch (primaryError) {
    console.error('Primary token verification failed:', primaryError.message);
    console.error('Primary error name:', primaryError.name);
    
    try {
      console.log('Attempting to verify token with legacy JWT secret');
      if (!LEGACY_JWT_SECRET) throw new Error('Legacy JWT secret not configured');
      console.log('LEGACY_JWT_SECRET first 10 chars:', LEGACY_JWT_SECRET.substring(0, 10) + '...');
      decoded = jwt.verify(tokenValue, LEGACY_JWT_SECRET);
      console.warn('Token verified using legacy JWT secret. Consider reissuing tokens.');
      console.log('Decoded token user ID (legacy):', decoded.id);
    } catch (legacyError) {
      console.error('Legacy token verification also failed:', legacyError.message);
      console.error('Legacy error name:', legacyError.name);
      // For public endpoints, continue without authentication
      if (req.originalUrl === '/api/groups' && req.method === 'GET') {
        return next();
      }

      // For API routes, return JSON error
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized! Token is invalid or expired.'
        });
      }

      // For web routes, clear cookie and redirect to login
      res.clearCookie('token');
      return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl) + 
                         '&error=' + encodeURIComponent('Your session has expired. Please log in again.'));
    }
  }

  try {
    
    // Set userId in request
    req.userId = decoded.id;
    
    // Check if token is close to expiration (less than 24 hours remaining)
    // and renew it if needed
    if (decoded.exp && decoded.exp - (Date.now() / 1000) < 24 * 60 * 60) {
      console.log('Token close to expiration, renewing...');
      
      // Generate new token with fresh expiration
      const newToken = jwt.sign({ id: decoded.id }, JWT_SECRET, {
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
      
      console.log('Token renewed successfully');
    }
    
    next();
  } catch (error) {
    console.error('Token post-verification processing failed:', error.message);
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized! Token is invalid or expired.'
      });
    }
    res.clearCookie('token');
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl) +
                       '&error=' + encodeURIComponent('Your session has expired. Please log in again.'));
  }
};

/**
 * Check if request is from an authenticated user
 * Creates middleware that verifies token and validates against database
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} - Continues to next middleware or returns error response
 */
const isAuthenticated = async (req, res, next) => {
  try {
    // Verify token first
    verifyToken(req, res, async () => {
      // Skip user check for public endpoints
      if (req.originalUrl === '/api/groups' && req.method === 'GET' && !req.userId) {
        return next();
      }
      
      // Check if user exists
      const user = await User.findById(req.userId);
      
      if (!user) {
        console.log(`User not found for ID: ${req.userId}`);
        
        // For API routes, return JSON error
        if (req.originalUrl.startsWith('/api/')) {
          return res.status(404).json({
            success: false,
            message: 'User not found!'
          });
        }
        
        // For web routes, clear cookie and redirect to login
        res.clearCookie('token');
        return res.redirect('/login?error=' + encodeURIComponent('User account not found. Please log in again.'));
      }
      
      next();
    });
  } catch (error) {
    console.error('Authentication error:', error.message);
    
    // For API routes, return JSON error
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(500).json({
        success: false,
        message: 'An error occurred while authenticating user.',
        error: error.message
      });
    }
    
    // For web routes, redirect to error page
    return res.status(500).render('error', {
      title: 'Authentication Error',
      message: 'An error occurred during authentication. Please try again later.'
    });
  }
};

const authJwt = {
  verifyToken,
  isAuthenticated
};

module.exports = authJwt;
