const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const config = require('./config/auth.config');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Database configuration
const dbConfig = require('./config/db.config');
const connectionURL = `${dbConfig.HOST}/${dbConfig.DB}`;

// Connect to MongoDB with better error handling
console.log('Attempting to connect to MongoDB...', {
  host: dbConfig.HOST,
  database: dbConfig.DB
});

mongoose.connect(connectionURL, dbConfig.options)
  .then(() => {
    console.log('Successfully connected to MongoDB.');
    initializeDatabase();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit();
  });

// Initialize database with roles if needed
async function initializeDatabase() {
  try {
    const db = require('./models');
    const Role = db.role;
    
    const count = await Role.estimatedDocumentCount();
    
    if (count === 0) {
      await Promise.all([
        new Role({ name: "user" }).save(),
        new Role({ name: "moderator" }).save(),
        new Role({ name: "admin" }).save()
      ]);
      console.log('Added roles to database');
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// Middleware
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
const fs = require('fs');
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
    // Get token from various sources
    const token = req.headers.authorization?.split(' ')[1] || 
                 req.cookies?.token || 
                 req.query?.token;

    if (token) {
      try {
        // Verify token using the same secret as in auth.config.js
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "bezkoder-secret-key");
        const User = require('./models/user.model');
        const user = await User.findById(decoded.id).select('-password');
        
        if (user) {
          // Add user data to locals for all views
          res.locals.user = user;
          console.log('User authenticated:', user.username, 'ID:', user._id); // Enhanced debug log
        } else {
          console.log('Token valid but user not found in database');
          res.clearCookie('token'); // Clear token if user doesn't exist
        }
      } catch (err) {
        console.error('Token verification failed:', err);
        res.clearCookie('token'); // Clear invalid token
      }
    } else {
      console.log('No authentication token found');
    }
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    next();
  }
});

// API Routes with error handling
const wrapAsync = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Auth routes (both pages and API)
const authRoutes = require('./routes/auth.routes');
app.use('/', authRoutes); // Mount at root for pages

// Other API routes
app.use('/api/marketplace', require('./routes/marketplace.routes'));
app.use('/api/groups', require('./routes/groups.routes'));
app.use('/api/orders', require('./routes/orders.routes'));

// Page Routes
app.get('/', (req, res) => {
  res.render('pages/index', { 
    title: 'FreshShare - Home'
  });
});

app.get('/marketplace', (req, res) => {
  res.render('pages/marketplace', { 
    title: 'FreshShare - Marketplace'
  });
});

app.get('/create-listing', (req, res) => {
  res.render('pages/create-listing', { 
    title: 'FreshShare - Create Listing'
  });
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

app.get('/orders/:id', (req, res) => {
  res.render('pages/order_details', { 
    title: 'FreshShare - Order Details',
    orderId: req.params.id
  });
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

    // Render the profile page with the user data
    res.render('pages/profile', {
      title: 'FreshShare - Profile',
      user: formattedUserData
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
    return res.redirect('/login');
  }
  res.render('pages/dashboard', { 
    title: 'FreshShare - Dashboard'
  });
});

app.get('/login', (req, res) => {
  if (res.locals.user) {
    return res.redirect('/dashboard');
  }
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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
