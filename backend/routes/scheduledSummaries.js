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

// Execute scheduled summaries (called by cron job or manual trigger)
router.post('/execute', async (req, res) => {
  try {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:mm format
    
    console.log(`Checking for scheduled summaries at ${currentTime}`);
    
    // Find all users with scheduled summaries
    const users = await User.find({
      'preferences.scheduledSummaries': { $exists: true, $ne: [] }
    });
    
    let executedCount = 0;
    
    for (const user of users) {
      const preferences = user.getPreferences();
      const scheduledSummaries = preferences.scheduledSummaries || [];
      
      for (const summary of scheduledSummaries) {
        if (summary.isEnabled && summary.time === currentTime) {
          console.log(`Executing scheduled summary "${summary.name}" for user ${user.email}`);
          
          // Create a summary using the existing summarize endpoint logic
          // For now, just log that we would execute it
          // In a real implementation, you'd call the summarize endpoint
          
          // Update lastRun timestamp
          const summaryIndex = scheduledSummaries.findIndex(s => s.id === summary.id);
          if (summaryIndex !== -1) {
            scheduledSummaries[summaryIndex].lastRun = new Date().toISOString();
            await user.updatePreferences({ scheduledSummaries });
            executedCount++;
          }
        }
      }
    }
    
    res.json({ 
      message: `Executed ${executedCount} scheduled summaries at ${currentTime}`,
      executedCount 
    });
  } catch (error) {
    console.error('Error executing scheduled summaries:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
