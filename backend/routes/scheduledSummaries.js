const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { fetchArticlesForTopic, summarizeArticles, addIntroAndOutro, filterRelevantArticles, isUpliftingNews } = require('../index');
const User = require('../models/User');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

// Helper function to save user with retry logic for version conflicts
async function saveUserWithRetry(user, retries = 3) {
  // Preserve the scheduledSummaries we want to save
  const scheduledSummariesToSave = user.scheduledSummaries;
  
  while (retries > 0) {
    try {
      await user.save();
      return;
    } catch (error) {
      if (error.name === 'VersionError' && retries > 1) {
        console.log(`[SCHEDULED_SUMMARY] Version conflict, retrying... (${retries - 1} retries left)`);
        // Reload the document to get the latest version
        const freshUser = await User.findById(user._id);
        if (freshUser) {
          // Apply our scheduledSummaries changes to the fresh document
          freshUser.scheduledSummaries = scheduledSummariesToSave;
          // Copy the fresh user back to the original user object
          Object.assign(user, freshUser.toObject());
          // Ensure scheduledSummaries is set on the user object
          user.scheduledSummaries = scheduledSummariesToSave;
          // Mark as modified
          user.markModified('scheduledSummaries');
          retries--;
          continue;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
  throw new Error('Failed to save user after retries');
}

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
    
    // Save user to database with retry logic for version conflicts
    await saveUserWithRetry(user);
    
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
    
    // Save user to database with retry logic for version conflicts
    await saveUserWithRetry(user);
    
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
    
    // Save user to database with retry logic for version conflicts
    await saveUserWithRetry(user);
    
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
  try {
    console.log(`[SCHEDULER] Executing scheduled summary "${summary.name}" for user ${user.email}`);
    
    // Get user preferences
    const preferences = user.getPreferences ? user.getPreferences() : {};
    const wordCount = summary.wordCount || parseInt(preferences.length || '200', 10);
    const goodNewsOnly = preferences.upliftingNewsOnly || false;
    const location = user.location || '';
    
    // Combine regular topics and custom topics
    const allTopics = [...(summary.topics || []), ...(summary.customTopics || [])];
    
    if (allTopics.length === 0) {
      console.log(`[SCHEDULER] No topics to generate summary for user ${user.email}`);
      return;
    }
    
    // Get user's selected news sources (if premium)
    let selectedSources = [];
    if (user.isPremium && user.getPreferences) {
      selectedSources = preferences.selectedNewsSources || [];
    }
    
    const items = [];
    const combinedPieces = [];
    
    // Process each topic
    for (const topic of allTopics) {
      try {
        const perTopic = wordCount >= 1500 ? 20 : wordCount >= 800 ? 12 : 6;
        
        // Handle location
        let geoData = null;
        if (location && typeof location === 'string') {
          const locationStr = String(location).trim();
          if (locationStr) {
            const parts = locationStr.split(',').map(p => p.trim());
            geoData = {
              city: parts[0] || "",
              region: parts[1] || "",
              country: "US",
              countryCode: "US"
            };
          }
        }
        
        // Fetch articles for the topic
        const { articles } = await fetchArticlesForTopic(topic, geoData, perTopic, selectedSources);
        
        // Filter relevant articles
        let relevant = filterRelevantArticles(topic, geoData, articles, perTopic);
        
        // Apply uplifting news filter if enabled
        if (goodNewsOnly) {
          relevant = relevant.filter(isUpliftingNews);
        }
        
        // Generate summary
        const summaryText = await summarizeArticles(topic, geoData, relevant, wordCount, goodNewsOnly, user);
        
        if (summaryText) {
          combinedPieces.push(summaryText);
        }
        
        // Create source items
        const sourceItems = relevant.map((a, idx) => ({
          id: `${topic}-${idx}-${Date.now()}`,
          title: a.title || "",
          summary: (a.description || a.title || "").replace(/\s+/g, " ").trim().slice(0, 180),
          source: a.source || "",
          url: a.url || "",
          topic,
        }));
        
        items.push(...sourceItems);
      } catch (innerErr) {
        console.error(`[SCHEDULER] Error processing topic ${topic} for user ${user.email}:`, innerErr);
      }
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
      title = "Mixed Summary";
    }
    
    // Determine length category
    let lengthCategory = 'short';
    if (wordCount >= 1000) {
      lengthCategory = 'long';
    } else if (wordCount >= 800) {
      lengthCategory = 'medium';
    }
    
    // Save to user's summary history
    const summaryData = {
      id: `scheduled-${Date.now()}`,
      title: title,
      summary: combinedText,
      topics: allTopics,
      length: lengthCategory,
      audioUrl: null,
      sources: items.slice(0, 10) // Keep top 10 sources
    };
    
    if (mongoose.connection.readyState === 1) {
      // Add to history and increment usage, then save once
      user.summaryHistory.unshift({
        id: summaryData.id,
        title: summaryData.title,
        summary: summaryData.summary,
        topics: summaryData.topics,
        length: summaryData.length,
        timestamp: new Date(),
        audioUrl: summaryData.audioUrl,
        sources: summaryData.sources
      });
      
      // Keep only last 50 summaries
      if (user.summaryHistory.length > 50) {
        user.summaryHistory = user.summaryHistory.slice(0, 50);
      }
      
      // Increment usage
      user.dailyUsageCount += 1;
      user.lastUsageDate = new Date();
      
      // Single save for both operations
      await user.save();
    } else {
      await fallbackAuth.addSummaryToHistory(user, summaryData);
      await fallbackAuth.incrementUsage(user);
    }
    
    console.log(`[SCHEDULER] Successfully generated and saved summary "${title}" for user ${user.email}`);
  } catch (error) {
    console.error(`[SCHEDULER] Error executing scheduled summary for user ${user.email}:`, error);
    throw error;
  }
}

module.exports = router;
module.exports.executeScheduledSummary = executeScheduledSummary;
