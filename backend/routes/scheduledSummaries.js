const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Get user's scheduled summaries
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const preferences = user.getPreferences();
    const scheduledSummaries = preferences.scheduledSummaries || [];
    
    res.json({ scheduledSummaries });
  } catch (error) {
    console.error('Error fetching scheduled summaries:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new scheduled summary
router.post('/', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, time, topics, customTopics, isEnabled } = req.body;
    
    // Validate input
    if (!name || !time || !topics || !Array.isArray(topics)) {
      return res.status(400).json({ error: 'Missing required fields: name, time, topics' });
    }

    if (topics.length === 0 && (!customTopics || customTopics.length === 0)) {
      return res.status(400).json({ error: 'At least one topic must be selected' });
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      return res.status(400).json({ error: 'Invalid time format. Use HH:mm' });
    }

    // Create new scheduled summary
    const newSummary = {
      id: require('crypto').randomUUID(),
      name,
      time,
      topics: topics || [],
      customTopics: customTopics || [],
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      createdAt: new Date().toISOString(),
      lastRun: null
    };

    // Get current preferences and add new summary
    const preferences = user.getPreferences();
    const scheduledSummaries = preferences.scheduledSummaries || [];
    scheduledSummaries.push(newSummary);

    // Update user preferences
    await user.updatePreferences({ scheduledSummaries });

    res.status(201).json(newSummary);
  } catch (error) {
    console.error('Error creating scheduled summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update scheduled summary
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { id } = req.params;
    const { name, time, topics, customTopics, isEnabled } = req.body;
    
    // Validate input
    if (!name || !time || !topics || !Array.isArray(topics)) {
      return res.status(400).json({ error: 'Missing required fields: name, time, topics' });
    }

    if (topics.length === 0 && (!customTopics || customTopics.length === 0)) {
      return res.status(400).json({ error: 'At least one topic must be selected' });
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      return res.status(400).json({ error: 'Invalid time format. Use HH:mm' });
    }

    // Get current preferences
    const preferences = user.getPreferences();
    const scheduledSummaries = preferences.scheduledSummaries || [];
    
    // Find and update the summary
    const summaryIndex = scheduledSummaries.findIndex(s => s.id === id);
    if (summaryIndex === -1) {
      return res.status(404).json({ error: 'Scheduled summary not found' });
    }

    // Update the summary
    scheduledSummaries[summaryIndex] = {
      ...scheduledSummaries[summaryIndex],
      name,
      time,
      topics: topics || [],
      customTopics: customTopics || [],
      isEnabled: isEnabled !== undefined ? isEnabled : scheduledSummaries[summaryIndex].isEnabled
    };

    // Update user preferences
    await user.updatePreferences({ scheduledSummaries });

    res.json(scheduledSummaries[summaryIndex]);
  } catch (error) {
    console.error('Error updating scheduled summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete scheduled summary
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { id } = req.params;

    // Get current preferences
    const preferences = user.getPreferences();
    const scheduledSummaries = preferences.scheduledSummaries || [];
    
    // Find and remove the summary
    const summaryIndex = scheduledSummaries.findIndex(s => s.id === id);
    if (summaryIndex === -1) {
      return res.status(404).json({ error: 'Scheduled summary not found' });
    }

    // Remove the summary
    scheduledSummaries.splice(summaryIndex, 1);

    // Update user preferences
    await user.updatePreferences({ scheduledSummaries });

    res.json({ message: 'Scheduled summary deleted successfully' });
  } catch (error) {
    console.error('Error deleting scheduled summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
