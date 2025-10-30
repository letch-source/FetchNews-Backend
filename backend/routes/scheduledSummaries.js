const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's scheduled summaries
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Get scheduled summaries from user preferences
    const preferences = user.getPreferences();
    const scheduledSummaries = preferences.scheduledSummaries || [];
    
    // Also include last scheduled summary if it exists (for homepage display)
    const lastScheduledSummary = preferences.lastScheduledSummary || null;
    
    res.json({ 
      scheduledSummaries,
      lastScheduledSummary 
    });
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
  try {
    console.log(`[SCHEDULER] Executing scheduled summary for user ${user.email}`);
    
    // Combine topics from both regular topics and custom topics
    const allTopics = [...(summary.topics || []), ...(summary.customTopics || [])];
    
    if (allTopics.length === 0) {
      console.log(`[SCHEDULER] No topics selected for scheduled summary, skipping`);
      return;
    }
    
    // Import the summarize functionality from the main index.js
    const mongoose = require('mongoose');
    const User = require('../models/User');
    
    // Import functions from index.js
    const { fetchArticlesForTopic, summarizeArticles, addIntroAndOutro } = require('../index');
    
    const wordCount = summary.wordCount || 200;
    const goodNewsOnly = summary.goodNewsOnly || false;
    
    // Get user's selected news sources if premium
    let selectedSources = [];
    if (user.isPremium) {
      const preferences = user.getPreferences();
      selectedSources = preferences.selectedNewsSources || [];
    }
    
    const items = [];
    const combinedPieces = [];
    
    // Fetch articles and generate summary for each topic
    for (const topic of allTopics) {
      try {
        const perTopic = wordCount >= 1500 ? 20 : wordCount >= 800 ? 12 : 6;
        const geoData = null; // No location filtering for scheduled summaries
        
        const { articles } = await fetchArticlesForTopic(topic, geoData, perTopic, selectedSources);
        
        if (!articles || articles.length === 0) {
          console.log(`[SCHEDULER] No articles found for topic: ${topic}`);
          continue;
        }
        
        // Generate summary for this topic
        const summaryText = await summarizeArticles(topic, geoData, articles.slice(0, 6), wordCount, goodNewsOnly, user);
        
        if (summaryText) {
          combinedPieces.push(summaryText);
        }
        
        // Add source items
        const sourceItems = articles.slice(0, 6).map((a, idx) => ({
          id: `${topic}-${idx}-${Date.now()}`,
          title: a.title || "",
          summary: (a.description || a.title || "").replace(/\s+/g, " ").trim().slice(0, 180),
          source: (typeof a.source === 'string' ? a.source : (a.source?.name || a.source?.id || "")),
          url: a.url || "",
          topic,
        }));
        
        items.push(...sourceItems);
      } catch (error) {
        console.error(`[SCHEDULER] Error processing topic ${topic}:`, error);
      }
    }
    
    if (combinedPieces.length === 0) {
      console.log(`[SCHEDULER] No summary generated, skipping save`);
      return;
    }
    
    // Combine all topic summaries
    let combinedText = combinedPieces.join(" ").trim();
    
    // Add intro and outro
    combinedText = addIntroAndOutro(combinedText, allTopics, goodNewsOnly, user);
    
    // Generate title
    let title = "Scheduled Summary";
    if (allTopics.length === 1) {
      title = `${allTopics[0].charAt(0).toUpperCase() + allTopics[0].slice(1)} Summary`;
    } else if (allTopics.length > 1) {
      title = "Scheduled Summary";
    }
    
    // Save to summary history
    const summaryData = {
      id: `scheduled-${Date.now()}`,
      title: title,
      summary: combinedText,
      topics: allTopics,
      length: wordCount <= 200 ? 'short' : wordCount <= 800 ? 'medium' : 'long',
      timestamp: new Date().toISOString(),
      audioUrl: null, // Will be generated when user opens the app
      sources: items.map(i => i.source).filter(s => s && typeof s === 'string' && s.length > 0)
    };
    
    // Add to user's summary history
    if (mongoose.connection.readyState === 1) {
      await user.addSummaryToHistory(summaryData);
    } else {
      const fallbackAuth = require('../utils/fallbackAuth');
      await fallbackAuth.addSummaryToHistory(user, summaryData);
    }
    
    // Store scheduled summary data for homepage display
    // This will be available when the user opens the app
    const preferences = user.getPreferences();
    preferences.lastScheduledSummary = {
      id: summaryData.id,
      title: summaryData.title,
      summary: summaryData.summary,
      topics: summaryData.topics,
      timestamp: summaryData.timestamp,
      needsNotification: true // Flag to trigger notification
    };
    
    if (mongoose.connection.readyState === 1) {
      await user.updatePreferences(preferences);
    }
    
    console.log(`[SCHEDULER] Successfully generated and saved scheduled summary for user ${user.email}`);
    
    // TODO: Send push notification here
    // For now, we'll just log that a notification should be sent
    console.log(`[SCHEDULER] Notification should be sent to user ${user.email} for scheduled summary`);
    
  } catch (error) {
    console.error(`[SCHEDULER] Error executing scheduled summary:`, error);
    throw error;
  }
}

module.exports = router;
module.exports.executeScheduledSummary = executeScheduledSummary;
