const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

// Helper function to determine time-based fetch name from timestamp
function getTimeBasedFetchName(timestamp) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  const hour = date.getHours();
  
  // Morning: 5:00 AM - 11:59 AM (5-11)
  if (hour >= 5 && hour < 12) {
    return "Morning Fetch";
  }
  // Afternoon: 12:00 PM - 4:59 PM (12-16)
  else if (hour >= 12 && hour < 17) {
    return "Afternoon Fetch";
  }
  // Evening: 5:00 PM - 4:59 AM (17-23 or 0-4)
  else {
    return "Evening Fetch";
  }
}

// Get user's summary history
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    let summaryHistory;
    
    if (mongoose.connection.readyState === 1) {
      summaryHistory = user.getSummaryHistory();
    } else {
      summaryHistory = fallbackAuth.getSummaryHistory(user);
    }
    
    // Convert timestamps to ISO strings for frontend compatibility
    // Ensure sources are properly serialized from Mongoose subdocuments
    const formattedHistory = summaryHistory.map(entry => {
      const entryObj = entry.toObject ? entry.toObject() : entry;
<<<<<<< Updated upstream
      const timestamp = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp);
      const timestampISO = timestamp.toISOString();
      
      const formatted = {
        ...entryObj,
        timestamp: timestampISO
      };
      
      // Fix time-based titles: regenerate based on actual timestamp to ensure correctness
      // Check if title is a time-based fetch name (Morning/Afternoon/Evening Fetch)
      if (entryObj.title && typeof entryObj.title === 'string') {
        const titleMatch = entryObj.title.match(/^(Morning|Afternoon|Evening) Fetch$/);
        if (titleMatch && timestamp) {
          const correctTitle = getTimeBasedFetchName(timestamp);
          if (correctTitle && correctTitle !== entryObj.title) {
            formatted.title = correctTitle;
          }
        }
      }
      
      // Ensure sources array is properly serialized (Mongoose subdocuments need explicit serialization)
      if (entryObj.sources && Array.isArray(entryObj.sources)) {
        formatted.sources = entryObj.sources.map(source => {
          if (typeof source === 'object' && source !== null) {
            return source.toObject ? source.toObject() : source;
          }
          return source;
        });
      }
      
      return formatted;
    });
    
    res.json(formattedHistory);
  } catch (error) {
    console.error('Get summary history error:', error);
    res.status(500).json({ error: 'Failed to get summary history' });
  }
});

// Add summary to history
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { summaryData } = req.body;
    const user = req.user;
    
    if (!summaryData || !summaryData.title || !summaryData.summary) {
      return res.status(400).json({ error: 'Summary data with title and summary is required' });
    }
    
    let summaryHistory;
    if (mongoose.connection.readyState === 1) {
      summaryHistory = await user.addSummaryToHistory(summaryData);
    } else {
      summaryHistory = await fallbackAuth.addSummaryToHistory(user, summaryData);
    }
    
    // Convert timestamps to ISO strings for frontend compatibility
    const formattedHistory = summaryHistory.map(entry => ({
      ...entry.toObject ? entry.toObject() : entry,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp
    }));
    
    res.json({ 
      message: 'Summary added to history successfully',
      summaryHistory: formattedHistory
    });
  } catch (error) {
    console.error('Add summary to history error:', error);
    res.status(500).json({ error: 'Failed to add summary to history' });
  }
});

// Clear summary history
router.delete('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    let summaryHistory;
    
    if (mongoose.connection.readyState === 1) {
      summaryHistory = await user.clearSummaryHistory();
    } else {
      summaryHistory = await fallbackAuth.clearSummaryHistory(user);
    }
    
    res.json({ 
      message: 'Summary history cleared successfully',
      summaryHistory 
    });
  } catch (error) {
    console.error('Clear summary history error:', error);
    res.status(500).json({ error: 'Failed to clear summary history' });
  }
});

module.exports = router;
