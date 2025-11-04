const jwt = require('jsonwebtoken');
const db = require('../models');
const User = db.user;

// Retrieve JWT secret from shared config or environment
const authConfig = require('../config/auth.config');
const JWT_SECRET = (authConfig && authConfig.secret) || process.env.JWT_SECRET;

/**
 * Synchronize token between localStorage and cookies
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response with status
 */
exports.syncToken = async (req, res) => {
    try {
        // Get token from request body or authorization header
        let token = req.body.token;
        
        if (!token && req.headers.authorization) {
            const authHeader = req.headers.authorization;
            token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
        }
        
        if (!token) {
            return res.status(400).json({
                success: false,
                message: "No token provided"
            });
        }
        
        // Verify the token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if user exists
        const user = await User.findById(decoded.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        
        // Set token as cookie
        const isSecureRequest = req.secure || (req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
        res.cookie('token', token, {
            httpOnly: true,
            secure: isSecureRequest,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
            sameSite: isSecureRequest ? 'none' : 'lax',
            path: '/'
        });
        
        // Return success response
        return res.status(200).json({
            success: true,
            message: "Token synchronized successfully"
        });
    } catch (error) {
        console.error("Token sync error:", error);
        return res.status(401).json({
            success: false,
            message: "Invalid token",
            error: error.message
        });
    }
};
