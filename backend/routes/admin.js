const express = require('express');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

// Middleware to verify admin token
const verifyAdminToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.body.adminToken;
  
  if (!token || token !== process.env.ADMIN_SECRET_TOKEN) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }
  
  next();
};

// Verify admin token endpoint
router.post('/verify', async (req, res) => {
  try {
    const { adminToken } = req.body;
    
    console.log('Admin token verification attempt:', {
      provided: adminToken ? adminToken.substring(0, 10) + '...' : 'none',
      expected: process.env.ADMIN_SECRET_TOKEN ? process.env.ADMIN_SECRET_TOKEN.substring(0, 10) + '...' : 'none',
      match: adminToken === process.env.ADMIN_SECRET_TOKEN
    });
    
    if (adminToken === process.env.ADMIN_SECRET_TOKEN) {
      res.json({ success: true });
    } else {
      res.status(403).json({ error: 'Invalid admin token' });
    }
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Get dashboard overview
router.get('/overview', verifyAdminToken, async (req, res) => {
  try {
    let stats = {
      totalUsers: 0,
      premiumUsers: 0,
      dailySummaries: 0,
      revenue: 0,
      userGrowth: {
        labels: [],
        data: []
      },
      dailyUsage: {
        labels: [],
        data: []
      }
    };

    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      
      // Get user statistics
      const totalUsers = await User.countDocuments();
      const premiumUsers = await User.countDocuments({ isPremium: true });
      
      // Get daily summaries (sum of dailyUsageCount for today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const users = await User.find({ lastUsageDate: { $gte: today } });
      const dailySummaries = users.reduce((sum, user) => sum + (user.dailyUsageCount || 0), 0);
      
      // Calculate revenue (only users with active paid subscriptions, not admin-granted)
      const paidPremiumUsers = await User.countDocuments({ 
        isPremium: true,
        premiumSource: 'paid',
        subscriptionId: { $exists: true, $ne: null, $ne: 'admin-test' },
        subscriptionExpiresAt: { $gt: new Date() }
      });
      const revenue = paidPremiumUsers * 3.99;
      
      // Get user growth data (last 7 days)
      const userGrowthData = [];
      const userGrowthLabels = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const newUsers = await User.countDocuments({
          createdAt: { $gte: date, $lt: nextDate }
        });
        
        userGrowthData.push(newUsers);
        userGrowthLabels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      }
      
      // Get daily usage data (last 7 days)
      const dailyUsageData = [];
      const dailyUsageLabels = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const users = await User.find({
          lastUsageDate: { $gte: date, $lt: nextDate }
        });
        
        const dailyUsage = users.reduce((sum, user) => sum + (user.dailyUsageCount || 0), 0);
        dailyUsageData.push(dailyUsage);
        dailyUsageLabels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      }
      
      stats = {
        totalUsers,
        premiumUsers,
        dailySummaries,
        revenue: Math.round(revenue * 100) / 100,
        userGrowth: {
          labels: userGrowthLabels,
          data: userGrowthData
        },
        dailyUsage: {
          labels: dailyUsageLabels,
          data: dailyUsageData
        }
      };
    } else {
      // Fallback for when database is not available
      const fallbackUsers = Array.from(fallbackAuth.fallbackUsers?.values() || []);
      stats = {
        totalUsers: fallbackUsers.length,
        premiumUsers: fallbackUsers.filter(u => u.isPremium).length,
        dailySummaries: fallbackUsers.reduce((sum, user) => sum + (user.dailyUsageCount || 0), 0),
        revenue: fallbackUsers.filter(u => u.isPremium && u.premiumSource === 'paid' && u.subscriptionId && u.subscriptionId !== 'admin-test' && u.subscriptionExpiresAt > new Date()).length * 3.99,
        userGrowth: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          data: [0, 0, 0, 0, 0, 0, 0]
        },
        dailyUsage: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          data: [0, 0, 0, 0, 0, 0, 0]
        }
      };
    }

    res.json(stats);
  } catch (error) {
    console.error('Overview data error:', error);
    res.status(500).json({ error: 'Failed to load overview data' });
  }
});

// Get all users
router.get('/users', verifyAdminToken, async (req, res) => {
  try {
    let users = [];

    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      const dbUsers = await User.find({}).sort({ createdAt: -1 });
      users = dbUsers.map(user => ({
        id: user._id,
        email: user.email,
        isPremium: user.isPremium,
        premiumSource: user.premiumSource,
        dailyUsageCount: user.dailyUsageCount,
        createdAt: user.createdAt,
        subscriptionId: user.subscriptionId,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        deviceInfo: user.deviceInfo
      }));
    } else {
      // Fallback for when database is not available
      const fallbackUsers = Array.from(fallbackAuth.fallbackUsers?.values() || []);
      users = fallbackUsers.map(user => ({
        id: user._id,
        email: user.email,
        isPremium: user.isPremium,
        premiumSource: user.premiumSource,
        dailyUsageCount: user.dailyUsageCount,
        createdAt: user.createdAt,
        subscriptionId: user.subscriptionId,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        deviceInfo: user.deviceInfo
      }));
    }

    res.json(users);
  } catch (error) {
    console.error('Users data error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// Get analytics data
router.get('/analytics', verifyAdminToken, async (req, res) => {
  try {
    let analytics = {
      popularTopics: {
        labels: [],
        data: []
      },
      summaryLengths: {
        labels: ['Short (≤200)', 'Medium (201-1000)', 'Long (1001+)'],
        data: [0, 0, 0]
      },
      dailySummaries: {
        labels: [],
        data: []
      }
    };

    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      
      // Get popular topics from summary history
      const users = await User.find({ 'summaryHistory.0': { $exists: true } });
      console.log(`Found ${users.length} users with summary history`);
      const topicCounts = {};
      const lengthCounts = { short: 0, medium: 0, long: 0 };
      const dailySummaryCounts = {};
      
      users.forEach(user => {
        if (user.summaryHistory) {
          user.summaryHistory.forEach(summary => {
            // Count topics
            if (summary.topics) {
              summary.topics.forEach(topic => {
                topicCounts[topic] = (topicCounts[topic] || 0) + 1;
              });
            }
            
            // Count lengths based on word count - updated to match actual length options
            if (summary.wordCount) {
              const wordCount = parseInt(summary.wordCount);
              console.log(`Processing summary with wordCount: ${wordCount}`);
              if (wordCount <= 200) {
                lengthCounts.short++;
              } else if (wordCount <= 1000) {
                lengthCounts.medium++;
              } else {
                lengthCounts.long++;
              }
            } else if (summary.length) {
              // Fallback to existing length field if wordCount not available
              const length = summary.length.toLowerCase();
              console.log(`Processing summary with length: ${length}`);
              if (length.includes('short') || length === 'short' || length === '200') {
                lengthCounts.short++;
              } else if (length.includes('medium') || length === 'medium' || length === '1000') {
                lengthCounts.medium++;
              } else if (length.includes('long') || length === 'long' || length === '2000') {
                lengthCounts.long++;
              }
            }
            
            // Count daily summaries
            if (summary.createdAt) {
              const date = new Date(summary.createdAt).toISOString().split('T')[0];
              dailySummaryCounts[date] = (dailySummaryCounts[date] || 0) + 1;
            }
          });
        }
      });
      
      // Sort topics by popularity
      const sortedTopics = Object.entries(topicCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
      
      // Get last 7 days of summary data
      const dailyLabels = [];
      const dailyData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        dailyLabels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        dailyData.push(dailySummaryCounts[dateStr] || 0);
      }
      
      console.log(`Final length counts:`, lengthCounts);
      
      analytics = {
        popularTopics: {
          labels: sortedTopics.map(([topic]) => topic),
          data: sortedTopics.map(([, count]) => count)
        },
        summaryLengths: {
          labels: ['Short (≤200)', 'Medium (201-1000)', 'Long (1001+)'],
          data: [lengthCounts.short || 0, lengthCounts.medium || 0, lengthCounts.long || 0]
        },
        dailySummaries: {
          labels: dailyLabels,
          data: dailyData
        }
      };
    }

    res.json(analytics);
  } catch (error) {
    console.error('Analytics data error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// Get subscription data
router.get('/subscriptions', verifyAdminToken, async (req, res) => {
  try {
    let subscriptionData = {
      activeSubscriptions: 0,
      monthlyRevenue: 0,
      conversionRate: 0
    };

    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      
      const totalUsers = await User.countDocuments();
      const premiumUsers = await User.countDocuments({ isPremium: true });
      const activeSubscriptions = await User.countDocuments({
        isPremium: true,
        premiumSource: 'paid',
        subscriptionId: { $exists: true, $ne: null, $ne: 'admin-test' },
        subscriptionExpiresAt: { $gt: new Date() }
      });
      
      subscriptionData = {
        activeSubscriptions,
        monthlyRevenue: Math.round(activeSubscriptions * 3.99 * 100) / 100,
        conversionRate: totalUsers > 0 ? Math.round((premiumUsers / totalUsers) * 100) : 0
      };
    } else {
      // Fallback for when database is not available
      const fallbackUsers = Array.from(fallbackAuth.fallbackUsers?.values() || []);
      const totalUsers = fallbackUsers.length;
      const premiumUsers = fallbackUsers.filter(u => u.isPremium).length;
      
      subscriptionData = {
        activeSubscriptions: premiumUsers,
        monthlyRevenue: Math.round(fallbackUsers.filter(u => u.isPremium && u.premiumSource === 'paid' && u.subscriptionId && u.subscriptionId !== 'admin-test' && u.subscriptionExpiresAt > new Date()).length * 3.99 * 100) / 100,
        conversionRate: totalUsers > 0 ? Math.round((premiumUsers / totalUsers) * 100) : 0
      };
    }

    res.json(subscriptionData);
  } catch (error) {
    console.error('Subscription data error:', error);
    res.status(500).json({ error: 'Failed to load subscription data' });
  }
});

// Get admin history
router.get('/admin-history', verifyAdminToken, async (req, res) => {
  try {
    let adminHistory = [];
    
    if (mongoose.connection.readyState === 1) {
      const AdminAction = require('../models/AdminAction');
      adminHistory = await AdminAction.find()
        .sort({ timestamp: -1 })
        .limit(100)
        .lean();
    }
    
    res.json(adminHistory);
  } catch (error) {
    console.error('Admin history error:', error);
    res.status(500).json({ error: 'Failed to load admin history' });
  }
});

// Delete user
router.delete('/delete-user', verifyAdminToken, async (req, res) => {
  try {
    const { email, adminToken } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    let deleted = false;
    
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      const result = await User.deleteOne({ email });
      deleted = result.deletedCount > 0;
    } else {
      // Fallback for when database is not available
      if (fallbackAuth.fallbackUsers?.has(email)) {
        fallbackAuth.fallbackUsers.delete(email);
        deleted = true;
      }
    }
    
    if (deleted) {
      console.log(`Admin action: User ${email} deleted`);
      res.json({ message: 'User deleted successfully' });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
