const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's scheduled summaries
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Get scheduled summaries from user.scheduledSummaries
    const scheduledSummaries = user.scheduledSummaries || [];
    
    res.json({ scheduledSummaries });
  } catch (error) {
    console.error('Get scheduled summaries error:', error);
    res.status(500).json({ error: 'Failed to get scheduled summaries' });
  }
});

// Create a new scheduled summary
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, topics, customTopics, time, days, wordCount, isEnabled } = req.body;
    const user = req.user;
    
    if (!name || !time || !days) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const topicsArray = Array.isArray(topics) ? topics : (topics ? [topics] : []);
    const customTopicsArray = Array.isArray(customTopics) ? customTopics : (customTopics ? [customTopics] : []);
    
    if (topicsArray.length === 0 && customTopicsArray.length === 0) {
      return res.status(400).json({ error: 'At least one topic or custom topic is required' });
    }
    
    const scheduledSummaries = user.scheduledSummaries || [];
    
    // Create new scheduled summary
    const newSummary = {
      id: req.body.id || Date.now().toString(), // Use provided id if available
      name,
      topics: Array.isArray(topics) ? topics : (topics ? [topics] : []),
      customTopics: Array.isArray(customTopics) ? customTopics : (customTopics ? [customTopics] : []),
      time,
      days: Array.isArray(days) ? days : (days ? [days] : []),
      wordCount: wordCount || 200,
      isEnabled: isEnabled !== false,
      createdAt: req.body.createdAt || new Date().toISOString(),
      lastRun: req.body.lastRun || null
    };
    
    scheduledSummaries.push(newSummary);
    user.scheduledSummaries = scheduledSummaries;
    
    // Save user to database
    if (user.save) {
      await user.save();
    }
    
    res.status(201).json({ 
      message: 'Scheduled summary created successfully',
      scheduledSummary: newSummary 
    });
  } catch (error) {
    console.error('Create scheduled summary error:', error);
    res.status(500).json({ error: 'Failed to create scheduled summary' });
  }
});

// Update a scheduled summary
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, topics, customTopics, time, days, wordCount, isEnabled } = req.body;
    const user = req.user;
    
    const scheduledSummaries = user.scheduledSummaries || [];
    
    const summaryIndex = scheduledSummaries.findIndex(s => s.id === id);
    if (summaryIndex === -1) {
      return res.status(404).json({ error: 'Scheduled summary not found' });
    }
    
    // Update the scheduled summary with all provided fields
    if (name !== undefined) scheduledSummaries[summaryIndex].name = name;
    if (topics !== undefined) {
      scheduledSummaries[summaryIndex].topics = Array.isArray(topics) ? topics : (topics ? [topics] : []);
    }
    if (customTopics !== undefined) {
      scheduledSummaries[summaryIndex].customTopics = Array.isArray(customTopics) ? customTopics : (customTopics ? [customTopics] : []);
    }
    if (time !== undefined) scheduledSummaries[summaryIndex].time = time;
    if (days !== undefined) {
      scheduledSummaries[summaryIndex].days = Array.isArray(days) ? days : (days ? [days] : []);
    }
    if (wordCount !== undefined) scheduledSummaries[summaryIndex].wordCount = wordCount;
    if (isEnabled !== undefined) scheduledSummaries[summaryIndex].isEnabled = isEnabled;
    
    scheduledSummaries[summaryIndex].updatedAt = new Date().toISOString();
    
    user.scheduledSummaries = scheduledSummaries;
    
    // Save user to database
    if (user.save) {
      await user.save();
    }
    
    res.json({ 
      message: 'Scheduled summary updated successfully',
      scheduledSummary: scheduledSummaries[summaryIndex] 
    });
  } catch (error) {
    console.error('Update scheduled summary error:', error);
    res.status(500).json({ error: 'Failed to update scheduled summary' });
  }
});

// Delete a scheduled summary
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const scheduledSummaries = user.scheduledSummaries || [];
    
    const summaryIndex = scheduledSummaries.findIndex(s => s.id === id);
    if (summaryIndex === -1) {
      return res.status(404).json({ error: 'Scheduled summary not found' });
    }
    
    // Remove the scheduled summary
    scheduledSummaries.splice(summaryIndex, 1);
    user.scheduledSummaries = scheduledSummaries;
    
    // Save user to database
    if (user.save) {
      await user.save();
    }
    
    res.json({ message: 'Scheduled summary deleted successfully' });
  } catch (error) {
    console.error('Delete scheduled summary error:', error);
    res.status(500).json({ error: 'Failed to delete scheduled summary' });
  }
});

// Execute a scheduled summary (for testing or manual execution)
router.post('/:id/execute', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const scheduledSummaries = user.scheduledSummaries || [];
    
    const summary = scheduledSummaries.find(s => s.id === id);
    if (!summary) {
      return res.status(404).json({ error: 'Scheduled summary not found' });
    }
    
    // This is a placeholder - in a real implementation, this would execute the summary
    res.json({ 
      message: 'Scheduled summary execution requested',
      summaryId: id 
    });
  } catch (error) {
    console.error('Execute scheduled summary error:', error);
    res.status(500).json({ error: 'Failed to execute scheduled summary' });
  }
});

// Export function for use by scheduler
async function executeScheduledSummary(user, summary) {
  // This is a placeholder function for the scheduler
  console.log(`Executing scheduled summary "${summary.name}" for user ${user.email}`);
  // In a real implementation, this would generate and send the summary
}

module.exports = router;
module.exports.executeScheduledSummary = executeScheduledSummary;
