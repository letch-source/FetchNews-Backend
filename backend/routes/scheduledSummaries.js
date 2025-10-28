const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's scheduled summaries
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Get scheduled summaries from user preferences
    const preferences = user.preferences || {};
    const scheduledSummaries = preferences.scheduledSummaries || [];
    
    res.json({ scheduledSummaries });
  } catch (error) {
    console.error('Get scheduled summaries error:', error);
    res.status(500).json({ error: 'Failed to get scheduled summaries' });
  }
});

// Create a new scheduled summary
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, topics, time, days, wordCount, isEnabled } = req.body;
    const user = req.user;
    
    if (!name || !topics || !time || !days) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const preferences = user.preferences || {};
    const scheduledSummaries = preferences.scheduledSummaries || [];
    
    // Create new scheduled summary
    const newSummary = {
      id: Date.now().toString(),
      name,
      topics: Array.isArray(topics) ? topics : [topics],
      time,
      days: Array.isArray(days) ? days : [days],
      wordCount: wordCount || 200,
      isEnabled: isEnabled !== false,
      createdAt: new Date().toISOString()
    };
    
    scheduledSummaries.push(newSummary);
    preferences.scheduledSummaries = scheduledSummaries;
    user.preferences = preferences;
    
    // Save user (this would be a database operation in real implementation)
    // await user.save();
    
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
    const { name, topics, time, days, wordCount, isEnabled } = req.body;
    const user = req.user;
    
    const preferences = user.preferences || {};
    const scheduledSummaries = preferences.scheduledSummaries || [];
    
    const summaryIndex = scheduledSummaries.findIndex(s => s.id === id);
    if (summaryIndex === -1) {
      return res.status(404).json({ error: 'Scheduled summary not found' });
    }
    
    // Update the scheduled summary
    if (name) scheduledSummaries[summaryIndex].name = name;
    if (topics) scheduledSummaries[summaryIndex].topics = Array.isArray(topics) ? topics : [topics];
    if (time) scheduledSummaries[summaryIndex].time = time;
    if (days) scheduledSummaries[summaryIndex].days = Array.isArray(days) ? days : [days];
    if (wordCount !== undefined) scheduledSummaries[summaryIndex].wordCount = wordCount;
    if (isEnabled !== undefined) scheduledSummaries[summaryIndex].isEnabled = isEnabled;
    
    scheduledSummaries[summaryIndex].updatedAt = new Date().toISOString();
    
    preferences.scheduledSummaries = scheduledSummaries;
    user.preferences = preferences;
    
    // Save user (this would be a database operation in real implementation)
    // await user.save();
    
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
    
    const preferences = user.preferences || {};
    const scheduledSummaries = preferences.scheduledSummaries || [];
    
    const summaryIndex = scheduledSummaries.findIndex(s => s.id === id);
    if (summaryIndex === -1) {
      return res.status(404).json({ error: 'Scheduled summary not found' });
    }
    
    // Remove the scheduled summary
    scheduledSummaries.splice(summaryIndex, 1);
    preferences.scheduledSummaries = scheduledSummaries;
    user.preferences = preferences;
    
    // Save user (this would be a database operation in real implementation)
    // await user.save();
    
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
    
    const preferences = user.preferences || {};
    const scheduledSummaries = preferences.scheduledSummaries || [];
    
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
