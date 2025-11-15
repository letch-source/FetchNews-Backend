const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-here';

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

// Verify JWT token middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if database is available
    const mongoose = require('mongoose');
    let user;
    
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      user = await User.findById(decoded.userId);
    } else {
      // Use fallback authentication
      const fallbackAuth = require('../utils/fallbackAuth');
      user = await fallbackAuth.findUserById(decoded.userId);
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // For admin routes, allow both Google and email/password accounts
    // Check if this is an admin route (use originalUrl to handle mounted routes)
    const isAdminRoute = (req.originalUrl && req.originalUrl.startsWith('/api/admin')) ||
                         (req.path && req.path.startsWith('/api/admin'));
    
    // Only require Google authentication for non-admin routes
    if (!isAdminRoute && !user.googleId) {
      return res.status(403).json({ error: 'Account must be linked to Google. Please sign in with Google.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Check if database is available
      const mongoose = require('mongoose');
      let user;
      
      if (mongoose.connection.readyState === 1) {
        const User = require('../models/User');
        user = await User.findById(decoded.userId);
      } else {
        // Use fallback authentication
        const fallbackAuth = require('../utils/fallbackAuth');
        user = await fallbackAuth.findUserById(decoded.userId);
      }
      
      // Only set user if they have googleId (Google-authenticated)
      if (user && user.googleId) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

module.exports = {
  generateToken,
  authenticateToken,
  optionalAuth
};
