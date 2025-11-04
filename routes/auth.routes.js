const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/auth.controller');
const tokenController = require('../controllers/token.controller');
const { authJwt } = require('../middleware');

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: { success: false, message: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 signups per hour per IP
  message: { success: false, message: 'Too many accounts created. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Ensure profile uploads directory exists
const profileUploadDir = path.join(__dirname, '..', 'public', 'uploads', 'profiles');
if (!fs.existsSync(profileUploadDir)) {
  fs.mkdirSync(profileUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, profileUploadDir);
  },
  filename: function(req, file, cb) {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${timestamp}-${sanitized}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif|svg/;
  const mimetype = allowed.test(file.mimetype);
  const extname = allowed.test(path.extname(file.originalname).toLowerCase());
  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only image files are allowed'));
};

const uploadProfileImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 3 * 1024 * 1024 // 3MB
  }
});

/**
 * Authentication Routes
 */

// Page routes
router.get('/login', (req, res) => {
    res.render('pages/login', { 
        title: 'FreshShare - Login'
    });
});

router.get('/signup', (req, res) => {
    res.render('pages/signup', { 
        title: 'FreshShare - Sign Up'
    });
});

router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

// API routes
// Register a new user (with rate limiting)
const signupValidators = [
  body('username').isString().trim().isLength({ min: 3, max: 30 }),
  body('email').isString().trim().isEmail(),
  body('password').isString().isLength({ min: 8 })
];
function handleValidation(req, res, next){
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e=>e.msg||(`${e.param}: ${e.msg}`)) });
  next();
}
router.post('/api/auth/signup', signupLimiter, signupValidators, handleValidation, authController.signup);

// Login a user (with rate limiting)
const loginValidators = [
  body('email').isString().trim().isEmail(),
  body('password').isString().isLength({ min: 1 })
];
router.post('/api/auth/login', authLimiter, loginValidators, handleValidation, authController.login);

// Get user profile (protected route)
router.get('/api/auth/profile', [authJwt.verifyToken], authController.getUserProfile);

// Update user profile (protected route)
router.put('/api/auth/profile', [authJwt.verifyToken], (req, res, next) => {
  uploadProfileImage.single('profileImage')(req, res, (err) => {
    if (err) {
      const status = err.message && err.message.includes('Only image files') ? 400 : 500;
      return res.status(status).json({ success: false, message: err.message || 'Image upload failed' });
    }
    next();
  });
}, authController.updateUserProfile);

// Sync token between localStorage and cookies
router.post('/api/auth/sync-token', tokenController.syncToken);

module.exports = router;
