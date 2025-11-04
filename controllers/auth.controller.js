const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models');
const User = db.user;
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const emailController = require('./email.controller');
const authConfig = require('../config/auth.config');

const DEFAULT_PROFILE_IMAGE = '/images/avatar-placeholder.svg';
const LEGACY_PLACEHOLDER_MATCH = 'avatar-placeholder.jpg';

const normalizeProfileImage = (value = '') => {
  const raw = (value || '').trim();
  if (!raw) {
    return DEFAULT_PROFILE_IMAGE;
  }
  if (raw.includes(LEGACY_PLACEHOLDER_MATCH)) {
    return DEFAULT_PROFILE_IMAGE;
  }
  return raw;
};

const shouldRemoveExistingImage = (value = '') => {
  const normalized = normalizeProfileImage(value);
  if (!value || !value.trim()) {
    return false;
  }
  if (normalized !== value) {
    return false;
  }
  return normalized !== DEFAULT_PROFILE_IMAGE;
};

// Retrieve JWT secret from shared config and keep legacy secret for compatibility
const JWT_SECRET = authConfig.secret;
const LEGACY_JWT_SECRET = process.env.LEGACY_JWT_SECRET || 'freshShare-auth-secret';

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response with status and message
 */
exports.signup = async (req, res) => {
  try {
    console.log('Signup request received:', req.body);
    
    // Validate request body
    const { username, email, password, firstName, lastName, address, city, zipCode } = req.body;
    
    if (!username || !email || !password) {
      console.log('Signup validation failed - missing required fields:', { 
        hasUsername: !!username, 
        hasEmail: !!email, 
        hasPassword: !!password 
      });
      return res.status(400).json({ 
        success: false, 
        message: "Username, email, and password are required!" 
      });
    }

    console.log('Checking for existing user with username or email:', { username, email });
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { username: username },
        { email: email }
      ] 
    });

    if (existingUser) {
      console.log('User already exists:', { 
        existingUsername: existingUser.username, 
        existingEmail: existingUser.email 
      });
      return res.status(400).json({
        success: false,
        message: "Username or email is already in use!"
      });
    }

    // Create new user - use async bcrypt for better performance and security
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('Creating new user:', { 
      username, 
      email, 
      hasFirstName: !!firstName, 
      hasLastName: !!lastName,
      hasAddress: !!address,
      hasCity: !!city,
      hasZipCode: !!zipCode
    });
    
    const user = new User({
      username: username,
      email: email,
      password: hashedPassword,
      firstName: firstName || '',
      lastName: lastName || '',
      location: {
        street: address || '',
        city: city || '',
        zipCode: zipCode || ''
      }
    });

    // Generate verification token
    const token = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = token;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Save user to database
    console.log('Attempting to save user to database...');
    await user.save();
    console.log('User saved successfully with ID:', user._id);

    // Try to send verification email
    try {
      // Create verification URL
      const APP_URL = process.env.APP_URL || 'http://localhost:3001';
      const verificationUrl = `${APP_URL}/verify-email?token=${token}`;
      
      // Create email options object for email controller
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'FreshShare <noreply@freshshare.com>',
        to: user.email,
        subject: 'FreshShare - Verify Your Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4CAF50;">Verify Your FreshShare Email</h2>
            <p>Hello ${user.username},</p>
            <p>Thank you for signing up for FreshShare! Please verify your email address by clicking the button below:</p>
            <a href="${verificationUrl}" style="display: inline-block; background-color: #4CAF50; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px; margin: 15px 0;">Verify Email</a>
            <p>If the button doesn't work, you can copy and paste this link in your browser:</p>
            <p>${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't sign up for FreshShare, please ignore this email.</p>
            <p>Best regards,<br>The FreshShare Team</p>
          </div>
        `
      };

      // Send email using the transporter from email controller
      await emailController.sendVerificationEmailDirectly(user.email, token, user.username);
      console.log('Verification email sent successfully to:', user.email);
    } catch (emailError) {
      // Log the error but don't fail the registration
      console.error('Failed to send verification email:', emailError);
    }

    // Return success response
    return res.status(201).json({
      success: true,
      message: "User registered successfully! Please check your email to verify your account."
    });
  } catch (error) {
    console.error("Registration error:", error);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "An error occurred during registration.",
      error: error.message
    });
  }
};

/**
 * Authenticate a user and generate JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response with token and user info
 */
exports.login = async (req, res) => {
  try {
    // Validate request body
    const { username, password, rememberMe } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Username and password are required!" 
      });
    }
    
    // Set expiration based on rememberMe option
    const tokenExpiration = rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60; // 30 days or 7 days
    const cookieExpiration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000; // in milliseconds

    // Find user by username - explicitly select password since it's now excluded by default
    const user = await User.findOne({ username: username }).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!"
      });
    }

    // Check password - use async for better performance
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid password!"
      });
    }
    const token = jwt.sign({ id: user._id }, JWT_SECRET, {
      expiresIn: tokenExpiration // either 30 or 7 days depending on rememberMe
    });
    try {
      console.log('[auth.controller] Issued login token preview:', token.substring(0, 15) + '...');
    } catch (err) {
      console.error('[auth.controller] Failed to log token preview:', err);
    }

    const isSecureRequest = req.secure || (req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isSecureRequest,
      maxAge: cookieExpiration,
      sameSite: isSecureRequest ? 'none' : 'lax',
      path: '/'
    });

    // Create user object without password
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImage: user.profileImage,
      location: {
        street: user.location.street,
        city: user.location.city,
        state: user.state,
        zipCode: user.location.zipCode
      },
      phoneNumber: user.phoneNumber,
      privacy: user.privacy || {},
      notifications: user.notifications || {}
    };

    // Return token and user info
    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token: token,
      user: userResponse
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during login.",
      error: error.message
    });
  }
};

/**
 * Get current user profile information
 * @param {Object} req - Express request object (with user attached from middleware)
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response with user info
 */
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found!'
      });
    }

    const location = user.location || {};

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        nickname: user.nickname,
        profileImage: normalizeProfileImage(user.profileImage),
        phoneNumber: user.phoneNumber,
        street: location.street || '',
        city: location.city || '',
        state: location.state || user.state || '',
        zipCode: location.zipCode || '',
        privacy: user.privacy || {},
        notifications: user.notifications || {}
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving user profile.',
      error: error.message
    });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      username,
      email,
      street,
      city,
      state,
      zipCode,
      phoneNumber,
      firstName,
      lastName,
      nickname
    } = req.body || {};

    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return res.status(404).json({
        success: false,
        message: 'User not found!'
      });
    }

    if ((username && username !== userDoc.username) || (email && email !== userDoc.email)) {
      const existingUser = await User.findOne({
        _id: { $ne: userId },
        $or: [
          username ? { username } : null,
          email ? { email } : null
        ].filter(Boolean)
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username or email is already in use by another user!'
        });
      }
    }

    if (username) userDoc.username = username;
    if (email) userDoc.email = email;
    if (typeof phoneNumber !== 'undefined') {
      userDoc.phoneNumber = phoneNumber;
    }
    if (typeof firstName !== 'undefined') {
      userDoc.firstName = firstName;
    }
    if (typeof lastName !== 'undefined') {
      userDoc.lastName = lastName;
    }
    if (typeof nickname !== 'undefined') {
      userDoc.nickname = nickname;
    }

    if (!userDoc.location) {
      userDoc.location = { street: '', city: '', state: '', zipCode: '' };
    }

    if (typeof street !== 'undefined') {
      userDoc.location.street = street;
    }
    if (typeof city !== 'undefined') {
      userDoc.location.city = city;
    }
    if (typeof zipCode !== 'undefined') {
      userDoc.location.zipCode = zipCode;
    }
    if (typeof state !== 'undefined') {
      userDoc.location.state = state;
      userDoc.state = state;
    }

    if (req.file) {
      const relativePath = `/uploads/profiles/${path.basename(req.file.path)}`;
      if (shouldRemoveExistingImage(userDoc.profileImage)) {
        const prevPath = path.join(
          __dirname,
          '..',
          'public',
          userDoc.profileImage.startsWith('/') ? userDoc.profileImage.slice(1) : userDoc.profileImage
        );
        fs.unlink(prevPath, (err) => {
          if (err && err.code !== 'ENOENT') {
            console.error('Failed to remove old profile image:', err);
          }
        });
      }
      userDoc.profileImage = relativePath;
    } else if (!userDoc.profileImage || userDoc.profileImage.includes(LEGACY_PLACEHOLDER_MATCH)) {
      userDoc.profileImage = DEFAULT_PROFILE_IMAGE;
    }

    await userDoc.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: userDoc._id,
        username: userDoc.username,
        email: userDoc.email,
        profileImage: normalizeProfileImage(userDoc.profileImage),
        firstName: userDoc.firstName,
        lastName: userDoc.lastName,
        nickname: userDoc.nickname,
        street: userDoc.location.street,
        city: userDoc.location.city,
        state: userDoc.location.state || userDoc.state || '',
        zipCode: userDoc.location.zipCode,
        phoneNumber: userDoc.phoneNumber
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating user profile.',
      error: error.message
    });
  }
};
