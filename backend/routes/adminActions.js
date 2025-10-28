const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const AdminAction = require('../models/AdminAction');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

const isDatabaseAvailable = () => mongoose.connection.readyState === 1;

// Get recent admin actions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Check if user is admin (for now, we'll allow any authenticated user to view actions)
    // In production, you might want to add proper admin role checking
    
    let adminActions;
    
    if (isDatabaseAvailable()) {
      // Get recent admin actions from database
      adminActions = await AdminAction.find()
        .sort({ timestamp: -1 })
        .limit(20)
        .lean();
      
      // Convert timestamps to ISO strings
      adminActions = adminActions.map(action => ({
        ...action,
        timestamp: action.timestamp.toISOString()
      }));
    } else {
      // Get from fallback storage
      adminActions = fallbackAuth.getAdminActions(20);
    }
    
    res.json({ adminActions });
  } catch (error) {
    console.error('Get admin actions error:', error);
    res.status(500).json({ error: 'Failed to get admin actions' });
  }
});

// Log an admin action
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { adminEmail, targetEmail, action, details } = req.body;
    const user = req.user;
    
    if (!adminEmail || !targetEmail || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    let adminAction;
    
    if (isDatabaseAvailable()) {
      // Save to database
      adminAction = new AdminAction({
        adminEmail,
        targetEmail,
        action,
        details: details || ''
      });
      
      await adminAction.save();
      
      // Convert timestamp to ISO string
      adminAction = {
        ...adminAction.toObject(),
        timestamp: adminAction.timestamp.toISOString()
      };
    } else {
      // Save to fallback storage
      adminAction = await fallbackAuth.logAdminAction(adminEmail, targetEmail, action, details);
    }
    
    res.status(201).json({ adminAction });
  } catch (error) {
    console.error('Log admin action error:', error);
    res.status(500).json({ error: 'Failed to log admin action' });
  }
});

module.exports = router;
