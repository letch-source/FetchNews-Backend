const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const AdminAction = require('../models/AdminAction');
const fallbackAuth = require('../utils/fallbackAuth');
const User = require('../models/User');

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

// Get analytics statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    let stats;
    
    if (isDatabaseAvailable()) {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Basic counts
      const totalUsers = await User.countDocuments();
      const premiumUsers = await User.countDocuments({ isPremium: true });
      const freeUsers = totalUsers - premiumUsers;
      const usersWithSummaries = await User.countDocuments({ 
        'summaryHistory.0': { $exists: true } 
      });

      // Total summaries
      const totalSummariesResult = await User.aggregate([
        { $project: { summaryCount: { $size: { $ifNull: ['$summaryHistory', []] } } } },
        { $group: { _id: null, total: { $sum: '$summaryCount' } } }
      ]);
      const totalSummaries = totalSummariesResult[0]?.total || 0;

      // Recent summaries (last 24h, 7d, 30d)
      const summariesLast24h = await User.aggregate([
        { $unwind: { path: '$summaryHistory', preserveNullAndEmptyArrays: true } },
        { $match: { 'summaryHistory.timestamp': { $gte: oneDayAgo } } },
        { $count: 'count' }
      ]);
      const summariesLast7d = await User.aggregate([
        { $unwind: { path: '$summaryHistory', preserveNullAndEmptyArrays: true } },
        { $match: { 'summaryHistory.timestamp': { $gte: sevenDaysAgo } } },
        { $count: 'count' }
      ]);
      const summariesLast30d = await User.aggregate([
        { $unwind: { path: '$summaryHistory', preserveNullAndEmptyArrays: true } },
        { $match: { 'summaryHistory.timestamp': { $gte: thirtyDaysAgo } } },
        { $count: 'count' }
      ]);

      // User growth
      const newUsersLast7d = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
      const newUsersLast30d = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

      // Active users (users with summaries in last 7 days)
      const activeUsers7d = await User.aggregate([
        { $unwind: { path: '$summaryHistory', preserveNullAndEmptyArrays: true } },
        { $match: { 'summaryHistory.timestamp': { $gte: sevenDaysAgo } } },
        { $group: { _id: '$_id' } },
        { $count: 'count' }
      ]);

      // Popular topics from summaries
      const popularTopics = await User.aggregate([
        { $unwind: { path: '$summaryHistory', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$summaryHistory.topics', preserveNullAndEmptyArrays: true } },
        { $group: { _id: { $toLower: '$summaryHistory.topics' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      // Summary length distribution
      const lengthDistribution = await User.aggregate([
        { $unwind: { path: '$summaryHistory', preserveNullAndEmptyArrays: true } },
        { $group: { _id: '$summaryHistory.length', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      // Average summaries per user
      const avgSummariesPerUser = usersWithSummaries > 0 
        ? Math.round((totalSummaries / usersWithSummaries) * 10) / 10 
        : 0;

      // Premium conversion rate
      const premiumConversionRate = totalUsers > 0 
        ? Math.round((premiumUsers / totalUsers) * 1000) / 10 
        : 0;

      stats = {
        // Basic metrics
        totalUsers,
        premiumUsers,
        freeUsers,
        usersWithSummaries,
        totalSummaries,
        
        // Recent activity
        summariesLast24h: summariesLast24h[0]?.count || 0,
        summariesLast7d: summariesLast7d[0]?.count || 0,
        summariesLast30d: summariesLast30d[0]?.count || 0,
        
        // User growth
        newUsersLast7d,
        newUsersLast30d,
        
        // Active users
        activeUsers7d: activeUsers7d[0]?.count || 0,
        
        // Analytics
        avgSummariesPerUser,
        premiumConversionRate,
        
        // Popular topics
        popularTopics: popularTopics.map(t => ({ topic: t._id, count: t.count })),
        
        // Length distribution
        lengthDistribution: lengthDistribution.map(l => ({ length: l._id || 'unknown', count: l.count }))
      };
    } else {
      // Fallback: return basic stats when database is not available
      stats = {
        totalUsers: 0,
        premiumUsers: 0,
        freeUsers: 0,
        usersWithSummaries: 0,
        totalSummaries: 0,
        summariesLast24h: 0,
        summariesLast7d: 0,
        summariesLast30d: 0,
        newUsersLast7d: 0,
        newUsersLast30d: 0,
        activeUsers7d: 0,
        avgSummariesPerUser: 0,
        premiumConversionRate: 0,
        popularTopics: [],
        lengthDistribution: []
      };
    }
    
    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
