const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

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
      const formatted = {
        ...entryObj,
        timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp
      };
      
      // Ensure sources array is properly serialized (Mongoose subdocuments need explicit serialization)
      if (entryObj.sources && Array.isArray(entryObj.sources)) {
        formatted.sources = entryObj.sources.map(source => {
          if (typeof source === 'object' && source !== null) {
            return source.toObject ? source.toObject() : source;
          }
          return source;
        });
      }
      
      // Debug logging
      console.log(`[SummaryHistory] Entry ${formatted.id} has ${formatted.sources?.length || 0} sources`);
      if (formatted.sources && formatted.sources.length > 0) {
        console.log(`[SummaryHistory] First source:`, JSON.stringify(formatted.sources[0], null, 2));
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
