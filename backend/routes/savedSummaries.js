const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

// Get saved summaries
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    let savedSummaries;
    if (mongoose.connection.readyState === 1) {
      savedSummaries = user.getSavedSummaries();
    } else {
      savedSummaries = fallbackAuth.getSavedSummaries(user);
    }
    
    // Convert timestamps to ISO strings for frontend compatibility
    const formattedSummaries = savedSummaries.map(entry => ({
      ...entry.toObject ? entry.toObject() : entry,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
      savedAt: entry.savedAt instanceof Date ? entry.savedAt.toISOString() : entry.savedAt
    }));
    
    res.json({ savedSummaries: formattedSummaries });
  } catch (error) {
    console.error('Get saved summaries error:', error);
    res.status(500).json({ error: 'Failed to get saved summaries' });
  }
});

// Save a summary
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { summaryData } = req.body;
    const user = req.user;
    
    if (!summaryData || !summaryData.id || !summaryData.title || !summaryData.summary) {
      return res.status(400).json({ error: 'Summary data with id, title and summary is required' });
    }
    
    let savedSummaries;
    if (mongoose.connection.readyState === 1) {
      savedSummaries = await user.saveSummary(summaryData);
    } else {
      savedSummaries = await fallbackAuth.saveSummary(user, summaryData);
    }
    
    // Convert timestamps to ISO strings for frontend compatibility
    const formattedSummaries = savedSummaries.map(entry => ({
      ...entry.toObject ? entry.toObject() : entry,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
      savedAt: entry.savedAt instanceof Date ? entry.savedAt.toISOString() : entry.savedAt
    }));
    
    res.json({ 
      message: 'Summary saved successfully',
      savedSummaries: formattedSummaries
    });
  } catch (error) {
    console.error('Save summary error:', error);
    res.status(500).json({ error: 'Failed to save summary' });
  }
});

// Unsave a summary
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    if (!id) {
      return res.status(400).json({ error: 'Summary ID is required' });
    }
    
    let savedSummaries;
    if (mongoose.connection.readyState === 1) {
      savedSummaries = await user.unsaveSummary(id);
    } else {
      savedSummaries = await fallbackAuth.unsaveSummary(user, id);
    }
    
    // Convert timestamps to ISO strings for frontend compatibility
    const formattedSummaries = savedSummaries.map(entry => ({
      ...entry.toObject ? entry.toObject() : entry,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
      savedAt: entry.savedAt instanceof Date ? entry.savedAt.toISOString() : entry.savedAt
    }));
    
    res.json({ 
      message: 'Summary unsaved successfully',
      savedSummaries: formattedSummaries
    });
  } catch (error) {
    console.error('Unsave summary error:', error);
    res.status(500).json({ error: 'Failed to unsave summary' });
  }
});

// Check if summary is saved
router.get('/check/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    if (!id) {
      return res.status(400).json({ error: 'Summary ID is required' });
    }
    
    let isSaved;
    if (mongoose.connection.readyState === 1) {
      isSaved = user.isSummarySaved(id);
    } else {
      isSaved = fallbackAuth.isSummarySaved(user, id);
    }
    
    res.json({ isSaved });
  } catch (error) {
    console.error('Check saved summary error:', error);
    res.status(500).json({ error: 'Failed to check if summary is saved' });
  }
});

// Clear all saved summaries
router.delete('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    let savedSummaries;
    if (mongoose.connection.readyState === 1) {
      savedSummaries = await user.clearSavedSummaries();
    } else {
      savedSummaries = await fallbackAuth.clearSavedSummaries(user);
    }
    
    res.json({ 
      message: 'All saved summaries cleared successfully',
      savedSummaries: []
    });
  } catch (error) {
    console.error('Clear saved summaries error:', error);
    res.status(500).json({ error: 'Failed to clear saved summaries' });
  }
});

module.exports = router;
