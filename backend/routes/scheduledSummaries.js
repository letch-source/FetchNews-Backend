const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const fetch = require('node-fetch');

// Function to execute a scheduled summary
async function executeScheduledSummary(user, summary) {
  try {
    // Combine regular and custom topics
    const allTopics = [...summary.topics, ...summary.customTopics];
    
    if (allTopics.length === 0) {
      throw new Error('No topics specified for scheduled summary');
    }
    
    // Get user's selected news sources (if premium)
    let selectedSources = [];
    if (user.isPremium) {
      const preferences = user.getPreferences();
      selectedSources = preferences.selectedNewsSources || [];
    }
    
    console.log(`Creating scheduled summary for topics: ${allTopics.join(', ')}`);
    console.log(`Using ${selectedSources.length} selected sources`);
    
    // Import the summarization functions from the main server
    const { fetchArticlesForTopic, summarizeArticles } = require('../server/index');
    
    // Get user's location for geo-targeted news
    const userLocation = user.location || {};
    const geo = userLocation.geo || null;
    
    // Fetch articles for each topic
    const allArticles = [];
    for (const topic of allTopics) {
      try {
        const articles = await fetchArticlesForTopic(topic, geo, 5, selectedSources);
        allArticles.push(...articles);
      } catch (error) {
        console.error(`Failed to fetch articles for topic ${topic}:`, error);
      }
    }
    
    if (allArticles.length === 0) {
      throw new Error('No articles found for scheduled summary topics');
    }
    
    // Create a real summary using the same logic as the regular summarize endpoint
    const combinedSummary = await summarizeArticles(
      allTopics.join(', '), 
      geo, 
      allArticles, 
      200, // Default word count
      false // goodNewsOnly
    );
    
    // Create a summary entry in the user's summary history
    const summaryEntry = {
      id: `scheduled-${Date.now()}`,
      title: summary.name,
      summary: combinedSummary,
      topics: allTopics,
      createdAt: new Date().toISOString(),
      isScheduled: true
    };
    
    // Add to user's summary history
    if (!user.summaryHistory) {
      user.summaryHistory = [];
    }
    user.summaryHistory.push(summaryEntry);
    
    // Keep only the last 50 summaries to prevent database bloat
    if (user.summaryHistory.length > 50) {
      user.summaryHistory = user.summaryHistory.slice(-50);
    }
    
    await user.save();
    
    console.log(`Scheduled summary "${summary.name}" created and saved to user's history`);
    
  } catch (error) {
    console.error('Error executing scheduled summary:', error);
    throw error;
  }
}

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

    const { name, time, topics, customTopics, days, isEnabled } = req.body;
    
    // Validate input
    if (!name || !time || !topics || !Array.isArray(topics) || !days || !Array.isArray(days)) {
      return res.status(400).json({ error: 'Missing required fields: name, time, topics, days' });
    }

    if (topics.length === 0 && (!customTopics || customTopics.length === 0)) {
      return res.status(400).json({ error: 'At least one topic must be selected' });
    }

    if (days.length === 0) {
      return res.status(400).json({ error: 'At least one day must be selected' });
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
      days: days || [],
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
    const { name, time, topics, customTopics, days, isEnabled } = req.body;
    
    // Validate input
    if (!name || !time || !topics || !Array.isArray(topics) || !days || !Array.isArray(days)) {
      return res.status(400).json({ error: 'Missing required fields: name, time, topics, days' });
    }

    if (topics.length === 0 && (!customTopics || customTopics.length === 0)) {
      return res.status(400).json({ error: 'At least one topic must be selected' });
    }

    if (days.length === 0) {
      return res.status(400).json({ error: 'At least one day must be selected' });
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
      days: days || [],
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
    
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    console.log(`Checking for scheduled summaries at ${currentTime} on ${currentDay}`);
    
    // Find all users with scheduled summaries
    const users = await User.find({
      'preferences.scheduledSummaries': { $exists: true, $ne: [] }
    });
    
    console.log(`Found ${users.length} users with scheduled summaries`);
    
    let executedCount = 0;
    let checkedCount = 0;
    let cleanedCount = 0;
    
    for (const user of users) {
      const preferences = user.getPreferences();
      let scheduledSummaries = preferences.scheduledSummaries || [];
      
      // Clean up summaries with empty days arrays (they can't execute anyway)
      const originalCount = scheduledSummaries.length;
      scheduledSummaries = scheduledSummaries.filter(summary => 
        summary.days && summary.days.length > 0
      );
      
      if (scheduledSummaries.length !== originalCount) {
        console.log(`Cleaned up ${originalCount - scheduledSummaries.length} summaries with empty days for user ${user.email}`);
        await user.updatePreferences({ scheduledSummaries });
        cleanedCount += (originalCount - scheduledSummaries.length);
      }
      
      console.log(`User ${user.email} has ${scheduledSummaries.length} scheduled summaries`);
      
      for (const summary of scheduledSummaries) {
        checkedCount++;
        const isCorrectDay = summary.days && summary.days.includes(currentDay);
        const isCorrectTime = summary.time === currentTime;
        const isEnabled = summary.isEnabled;
        
        console.log(`Summary "${summary.name}": enabled=${isEnabled}, time=${summary.time} (current=${currentTime}), days=${JSON.stringify(summary.days)} (current=${currentDay}), shouldExecute=${isEnabled && isCorrectTime && isCorrectDay}`);
        
        if (isEnabled && isCorrectTime && isCorrectDay) {
          console.log(`Executing scheduled summary "${summary.name}" for user ${user.email} on ${currentDay}`);
          
          try {
            // Create a summary using the existing summarize endpoint logic
            await executeScheduledSummary(user, summary);
            console.log(`Successfully executed scheduled summary "${summary.name}" for user ${user.email}`);
          } catch (error) {
            console.error(`Failed to execute scheduled summary "${summary.name}" for user ${user.email}:`, error);
          }
          
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
    
    console.log(`Checked ${checkedCount} summaries, executed ${executedCount}, cleaned ${cleanedCount}`);
    
    res.json({ 
      message: `Executed ${executedCount} scheduled summaries`,
      executedCount,
      checkedCount,
      cleanedCount,
      currentTime,
      currentDay
    });
  } catch (error) {
    console.error('Error executing scheduled summaries:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// Export the executeScheduledSummary function for use by the main server
module.exports.executeScheduledSummary = executeScheduledSummary;
