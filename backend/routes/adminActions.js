const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const AdminAction = require('../models/AdminAction');
const fallbackAuth = require('../utils/fallbackAuth');
const User = require('../models/User');
const GlobalSettings = require('../models/GlobalSettings');

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

// Get all users with their usage data
router.get('/users', authenticateToken, async (req, res) => {
  try {
    if (!isDatabaseAvailable()) {
      return res.status(503).json({ 
        error: 'Database not available',
        users: [] 
      });
    }

    // Get all users with selected fields
    const users = await User.find()
      .select('email isPremium dailyUsageCount lastUsageDate summaryHistory createdAt')
      .lean();

    // Calculate usage limits based on premium status
    const freeUserLimit = 3;
    const premiumUserLimit = 20;

    // Helper function to estimate listening time in minutes
    // Assumes average reading speed of ~150 words per minute
    function estimateListeningTime(summaries) {
      if (!summaries || summaries.length === 0) return 0;
      
      let totalMinutes = 0;
      summaries.forEach(summary => {
        // Estimate based on summary text length (if available)
        if (summary.summary) {
          const words = summary.summary.split(/\s+/).length;
          totalMinutes += words / 150; // average speaking speed
        } else {
          // Fallback: estimate based on length setting
          const lengthMap = {
            'short': 2,    // ~2 minutes
            'medium': 3.5, // ~3.5 minutes  
            'long': 5      // ~5 minutes
          };
          totalMinutes += lengthMap[summary.length] || 3;
        }
      });
      
      return Math.round(totalMinutes);
    }

    // Helper function to get date string in PST timezone
    function getDateStringInPST(date = new Date()) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(date);
      const year = parts.find(p => p.type === 'year').value;
      const month = parts.find(p => p.type === 'month').value;
      const day = parts.find(p => p.type === 'day').value;
      
      const pstDate = new Date(`${year}-${month}-${day}T00:00:00`);
      return pstDate.toDateString();
    }

    // Process users data
    const usersData = users.map(user => {
      const limit = user.isPremium ? premiumUserLimit : freeUserLimit;
      const now = new Date();
      const today = getDateStringInPST(now);
      const lastUsageDate = user.lastUsageDate ? getDateStringInPST(new Date(user.lastUsageDate)) : today;
      
      // Reset daily count if it's a new day (in PST timezone)
      const currentDailyCount = (lastUsageDate !== today) ? 0 : (user.dailyUsageCount || 0);
      
      return {
        email: user.email,
        isPremium: user.isPremium || false,
        dailyUsageCount: currentDailyCount,
        dailyLimit: limit,
        remainingFetches: Math.max(0, limit - currentDailyCount),
        totalFetches: user.summaryHistory?.length || 0,
        totalListeningTime: estimateListeningTime(user.summaryHistory),
        lastUsageDate: user.lastUsageDate,
        createdAt: user.createdAt
      };
    });

    // Sort by total fetches (most active users first)
    usersData.sort((a, b) => b.totalFetches - a.totalFetches);

    res.json({ users: usersData });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users data' });
  }
});

// Reset user's Fetch Usage (dailyUsageCount) to 0 for the current day
router.post('/users/:email/reset-usage', authenticateToken, async (req, res) => {
  try {
    if (!isDatabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { email } = req.params;
    const adminUser = req.user;
    
    // Find the target user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Store old count for logging
    const oldCount = user.dailyUsageCount || 0;
    
    // Reset dailyUsageCount to 0 and update lastUsageDate to today
    // This ensures the reset is for the current day and won't auto-reset on next check
    user.dailyUsageCount = 0;
    user.lastUsageDate = new Date();
    await user.save();
    
    // Log the admin action
    const adminEmail = adminUser.email || adminUser.id || 'unknown';
    const action = 'reset_usage';
    const details = `Reset daily usage count from ${oldCount} to 0 for ${email}`;
    
    let adminAction;
    if (isDatabaseAvailable()) {
      adminAction = new AdminAction({
        adminEmail,
        targetEmail: email,
        action,
        details
      });
      await adminAction.save();
      adminAction = {
        ...adminAction.toObject(),
        timestamp: adminAction.timestamp.toISOString()
      };
    } else {
      adminAction = await fallbackAuth.logAdminAction(adminEmail, email, action, details);
    }
    
    res.json({ 
      success: true,
      message: `Fetch Usage reset for ${email}`,
      user: {
        email: user.email,
        dailyUsageCount: user.dailyUsageCount,
        lastUsageDate: user.lastUsageDate
      }
    });
  } catch (error) {
    console.error('Reset user usage error:', error);
    res.status(500).json({ error: 'Failed to reset user usage' });
  }
});

// Debug endpoint to check user data (temporary)
router.get('/user-data/:email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Extract all unique topics from summary history
    const allTopicsFromHistory = new Set();
    if (user.summaryHistory) {
      user.summaryHistory.forEach(summary => {
        if (summary.topics) {
          summary.topics.forEach(topic => allTopicsFromHistory.add(topic));
        }
      });
    }
    
    res.json({
      email: user.email,
      customTopics: user.customTopics || [],
      selectedTopics: user.selectedTopics || [],
      lastFetchedTopics: user.lastFetchedTopics || [],
      summaryHistoryCount: user.summaryHistory?.length || 0,
      allTopicsFromHistory: Array.from(allTopicsFromHistory),
      recentSummaries: (user.summaryHistory || []).slice(0, 5).map(s => ({
        title: s.title,
        topics: s.topics,
        timestamp: s.timestamp
      }))
    });
  } catch (error) {
    console.error('Get user data error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Get excluded news sources setting (blocklist approach)
router.get('/global-news-sources', authenticateToken, async (req, res) => {
  try {
    if (!isDatabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const settings = await GlobalSettings.getOrCreate();
    
    res.json({
      sources: settings.excludedNewsSources || [],
      enabled: settings.excludedNewsSourcesEnabled || false
    });
  } catch (error) {
    console.error('Get excluded news sources error:', error);
    res.status(500).json({ error: 'Failed to get excluded news sources' });
  }
});

// Set excluded news sources (blocklist approach)
router.post('/global-news-sources', authenticateToken, async (req, res) => {
  try {
    if (!isDatabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { sources, enabled } = req.body;
    const adminUser = req.user;
    
    if (!Array.isArray(sources)) {
      return res.status(400).json({ error: 'sources must be an array' });
    }

    const settings = await GlobalSettings.getOrCreate();
    await settings.updateExcludedNewsSources(sources, enabled !== false);

    // Log the admin action
    const adminEmail = adminUser.email || adminUser.id || 'unknown';
    const action = enabled !== false ? 'Set Excluded News Sources' : 'Disabled Excluded News Sources';
    const details = enabled !== false 
      ? `Excluded ${sources.length} news sources: ${sources.join(', ')}`
      : 'Disabled excluded news sources (all sources will be used)';
    
    let adminAction;
    if (isDatabaseAvailable()) {
      adminAction = new AdminAction({
        adminEmail,
        targetEmail: 'system',
        action,
        details
      });
      await adminAction.save();
      adminAction = {
        ...adminAction.toObject(),
        timestamp: adminAction.timestamp.toISOString()
      };
    } else {
      adminAction = await fallbackAuth.logAdminAction(adminEmail, 'system', action, details);
    }

    res.json({
      success: true,
      message: enabled !== false 
        ? `Excluded news sources updated (${sources.length} sources excluded)`
        : 'Excluded news sources disabled (all sources will be used)',
      sources: settings.excludedNewsSources,
      enabled: settings.excludedNewsSourcesEnabled
    });
  } catch (error) {
    console.error('Set excluded news sources error:', error);
    res.status(500).json({ error: 'Failed to set excluded news sources' });
  }
});

module.exports = router;
