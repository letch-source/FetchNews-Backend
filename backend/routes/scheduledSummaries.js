const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { fetchArticlesForTopic, summarizeArticles, addIntroAndOutro, filterRelevantArticles, isUpliftingNews } = require('../index');
const User = require('../models/User');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');
const { sendNotificationToUser } = require('../utils/notifications');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// Helper function to save user with retry logic for version conflicts
// Uses atomic update operations to reduce version conflicts
async function saveUserWithRetry(user, retries = 3) {
  // Preserve the scheduledSummaries we want to save
  const scheduledSummariesToSave = user.scheduledSummaries;
  
  // Try atomic update first (avoids version conflicts)
  try {
    const updated = await User.findByIdAndUpdate(
      user._id,
      { 
        $set: { 
          scheduledSummaries: scheduledSummariesToSave,
          updatedAt: new Date().toISOString()
        } 
      },
      { new: true, runValidators: true }
    );
    
    if (updated) {
      // Sync back to original user object
      user.scheduledSummaries = updated.scheduledSummaries;
      user.__v = updated.__v;
      return;
    }
  } catch (atomicError) {
    // If atomic update fails, fall back to save with retry
    console.log(`[SCHEDULED_SUMMARY] Atomic update failed, using save with retry: ${atomicError.message}`);
  }
  
  // Fallback to save() with retry logic
  let currentUser = user;
  
  while (retries > 0) {
    try {
      await currentUser.save();
      // Sync back to original user object
      user.scheduledSummaries = currentUser.scheduledSummaries;
      user.markModified('scheduledSummaries');
      user.__v = currentUser.__v;
      return;
    } catch (error) {
      if (error.name === 'VersionError' && retries > 1) {
        retries--;
        const remainingRetries = retries;
        console.log(`[SCHEDULED_SUMMARY] Version conflict, retrying... (${remainingRetries} retries left)`);
        
        // Reload the document to get the latest version
        const freshUser = await User.findById(user._id);
        if (freshUser) {
          // Apply our scheduledSummaries changes to the fresh document
          freshUser.scheduledSummaries = scheduledSummariesToSave;
          freshUser.markModified('scheduledSummaries');
          // Use freshUser for next iteration
          currentUser = freshUser;
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

// Get user's scheduled fetch (ensure one always exists)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Ensure user has timezone set - if not, default to UTC (will be updated when user saves scheduled summary)
    if (!user.preferences || !user.preferences.timezone) {
      if (!user.preferences) {
        user.preferences = {};
      }
      // Don't set a default - let it be set when user saves their scheduled summary
      // This way we know it's their actual timezone from their device
    }
    
    // Get scheduled fetch from user.scheduledSummaries
    let scheduledSummaries = user.scheduledSummaries || [];
    
    // Ensure user always has exactly one scheduled fetch
    if (scheduledSummaries.length === 0) {
      // Create default scheduled fetch
      const defaultSummary = {
        id: Date.now().toString(),
        name: "Daily Fetch",
        topics: [],
        customTopics: [],
        time: "08:00",
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        wordCount: 200,
        isEnabled: false,
        createdAt: new Date().toISOString(),
        lastRun: null
      };
      
      scheduledSummaries = [defaultSummary];
      user.scheduledSummaries = scheduledSummaries;
      user.markModified('scheduledSummaries');
      
      // Save user with retry logic
      await saveUserWithRetry(user);
    } else if (scheduledSummaries.length > 1) {
      // If more than one, keep only the first one
      scheduledSummaries = [scheduledSummaries[0]];
      user.scheduledSummaries = scheduledSummaries;
      user.markModified('scheduledSummaries');
      await saveUserWithRetry(user);
    }
    
    res.json({ scheduledSummaries });
  } catch (error) {
    console.error('Get scheduled summaries error:', error);
    res.status(500).json({ error: 'Failed to get scheduled summaries' });
  }
});

// Create/Update scheduled fetch (users always have exactly one)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, topics, customTopics, time, days, wordCount, isEnabled, timezone } = req.body;
    const user = req.user;
    
    // If timezone is provided, update user's timezone preference
    if (timezone) {
      if (!user.preferences) {
        user.preferences = {};
      }
      user.preferences.timezone = timezone;
      user.markModified('preferences');
    }
    
    if (!time) {
      return res.status(400).json({ error: 'Time is required' });
    }
    
    const topicsArray = Array.isArray(topics) ? topics : (topics ? [topics] : []);
    const customTopicsArray = Array.isArray(customTopics) ? customTopics : (customTopics ? [customTopics] : []);
    
    // Get existing summary or create default
    let scheduledSummaries = user.scheduledSummaries || [];
    let existingSummary = scheduledSummaries[0];
    
    if (!existingSummary) {
      // Create default if none exists
      existingSummary = {
        id: Date.now().toString(),
        name: name || "Daily Fetch",
        topics: [],
        customTopics: [],
        time: "08:00",
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        wordCount: 200,
        isEnabled: false,
        createdAt: new Date().toISOString(),
        lastRun: null
      };
    }
    
    // Update the existing summary with provided values
    if (name !== undefined) existingSummary.name = name;
    // Always update topics and customTopics (even if empty arrays)
    if (topics !== undefined) {
      existingSummary.topics = topicsArray;
    }
    if (customTopics !== undefined) {
      existingSummary.customTopics = customTopicsArray;
    }
    existingSummary.time = time;
    if (days !== undefined) {
      existingSummary.days = Array.isArray(days) ? days : (days ? [days] : []);
    }
    if (wordCount !== undefined) existingSummary.wordCount = wordCount;
    if (isEnabled !== undefined) existingSummary.isEnabled = isEnabled;
    existingSummary.updatedAt = new Date().toISOString();
    
    // Keep only this one summary
    user.scheduledSummaries = [existingSummary];
    
    // Mark the array as modified so Mongoose knows to save it
    user.markModified('scheduledSummaries');
    
    // Save user to database with retry logic for version conflicts
    await saveUserWithRetry(user);
    
    // Return the scheduled summary directly (frontend expects this format)
    res.status(200).json(existingSummary);
  } catch (error) {
    console.error('Create/Update scheduled fetch error:', error);
    res.status(500).json({ error: 'Failed to save scheduled fetch' });
  }
});

// Update a scheduled fetch (users always have exactly one)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, topics, customTopics, time, days, wordCount, isEnabled, timezone } = req.body;
    const user = req.user;
    
    // If timezone is provided, update user's timezone preference
    if (timezone) {
      if (!user.preferences) {
        user.preferences = {};
      }
      user.preferences.timezone = timezone;
      user.markModified('preferences');
    }
    
    let scheduledSummaries = user.scheduledSummaries || [];
    let existingSummary = scheduledSummaries[0];
    
    // If no summary exists, create a default one (ignore the id parameter)
    if (!existingSummary) {
      existingSummary = {
        id: Date.now().toString(),
        name: "Daily Fetch",
        topics: [],
        customTopics: [],
        time: "08:00",
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        wordCount: 200,
        isEnabled: false,
        createdAt: new Date().toISOString(),
        lastRun: null
      };
    }
    
    // Update the scheduled fetch with all provided fields
    if (name !== undefined) existingSummary.name = name;
    // Always update topics and customTopics (even if empty arrays)
    if (topics !== undefined) {
      existingSummary.topics = Array.isArray(topics) ? topics : (topics ? [topics] : []);
    }
    if (customTopics !== undefined) {
      existingSummary.customTopics = Array.isArray(customTopics) ? customTopics : (customTopics ? [customTopics] : []);
    }
    if (time !== undefined) existingSummary.time = time;
    if (days !== undefined) {
      existingSummary.days = Array.isArray(days) ? days : (days ? [days] : []);
    }
    if (wordCount !== undefined) existingSummary.wordCount = wordCount;
    if (isEnabled !== undefined) existingSummary.isEnabled = isEnabled;
    
    existingSummary.updatedAt = new Date().toISOString();
    
    // Keep only this one summary
    user.scheduledSummaries = [existingSummary];
    
    // Mark the array as modified so Mongoose knows to save it
    user.markModified('scheduledSummaries');
    
    // Save user to database with retry logic for version conflicts
    // Ensure preferences object exists and is marked as modified if we updated timezone
    if (timezone && user.preferences) {
      user.markModified('preferences');
    }
    await saveUserWithRetry(user);
    
    // Return the scheduled summary directly (frontend expects this format)
    res.json(existingSummary);
    
    // Log timezone for debugging
    const savedTimezone = user.preferences?.timezone || 'not set';
    console.log(`[SCHEDULED_SUMMARY] Updated scheduled fetch for ${user.email}, timezone saved: ${savedTimezone}`);
  } catch (error) {
    console.error('Update scheduled fetch error:', error);
    res.status(500).json({ error: 'Failed to update scheduled fetch' });
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
      return res.status(404).json({ error: 'Scheduled fetch not found' });
    }
    
    // Remove the scheduled summary
    scheduledSummaries.splice(summaryIndex, 1);
    user.scheduledSummaries = scheduledSummaries;
    
    // Save user to database with retry logic for version conflicts
    await saveUserWithRetry(user);
    
    res.json({ message: 'Scheduled fetch deleted successfully' });
  } catch (error) {
    console.error('Delete scheduled fetch error:', error);
    res.status(500).json({ error: 'Failed to delete scheduled fetch' });
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
      return res.status(404).json({ error: 'Scheduled fetch not found' });
    }
    
    // This is a placeholder - in a real implementation, this would execute the summary
    res.json({ 
      message: 'Scheduled summary execution requested',
      summaryId: id 
    });
  } catch (error) {
    console.error('Execute scheduled fetch error:', error);
    res.status(500).json({ error: 'Failed to execute scheduled fetch' });
  }
});

// Export function for use by scheduler
async function executeScheduledSummary(user, summary) {
  try {
    console.log(`[SCHEDULER] Executing scheduled fetch "${summary.name}" for user ${user.email}`);
    
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
    let title = "Scheduled Fetch";
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
    
    // Generate audio for the summary (asynchronously - don't wait)
    let audioUrl = null;
    try {
      // Get user preferences for TTS
      const selectedVoice = user.selectedVoice || 'alloy';
      const playbackRate = user.playbackRate || 1.0;
      
      // Generate TTS by calling the internal TTS endpoint logic
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      if (!OPENAI_API_KEY) {
        throw new Error('TTS not configured');
      }
      
      // Clean and prepare text for TTS
      const cleaned = String(combinedText)
        .replace(/[\n\r\u2018\u2019\u201C\u201D]/g, (match) => {
          switch(match) {
            case '\n': case '\r': return ' ';
            case '\u2018': case '\u2019': return "'";
            case '\u201C': case '\u201D': return '"';
            default: return match;
          }
        })
        .replace(/\s+/g, " ")
        .trim();
      
      const maxLength = 4090;
      const finalText = cleaned.length > maxLength ? cleaned.slice(0, maxLength - 3) + "..." : cleaned;
      
      // Generate TTS
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      const normalizedVoice = String(selectedVoice || "alloy").toLowerCase();
      const availableVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
      const voiceToUse = availableVoices.includes(normalizedVoice) ? normalizedVoice : "alloy";
      
      let speech;
      const attempts = [
        { model: "tts-1", voice: voiceToUse },
        { model: "tts-1-hd", voice: voiceToUse },
      ];
      
      for (const { model, voice } of attempts) {
        try {
          speech = await openai.audio.speech.create({
            model,
            voice,
            input: finalText,
            format: "mp3",
          });
          if (speech) break;
        } catch (e) {
          console.error(`TTS attempt failed with ${model}/${voice}:`, e.message);
        }
      }
      
      if (speech) {
        // Save audio file
        const buffer = Buffer.from(await speech.arrayBuffer());
        const fileBase = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
        const mediaDir = path.join(__dirname, '../media');
        const filePath = path.join(mediaDir, fileBase);
        
        // Ensure media directory exists
        await fs.mkdir(mediaDir, { recursive: true });
        await fs.writeFile(filePath, buffer);
        
        // Create URL (relative to backend base URL)
        const baseUrl = process.env.BASE_URL || 'https://fetchnews-backend.onrender.com';
        audioUrl = `${baseUrl}/media/${fileBase}`;
      }
      
      if (audioUrl) {
        console.log(`[SCHEDULER] Audio generated for scheduled fetch "${title}"`);
      }
    } catch (audioError) {
      console.error(`[SCHEDULER] Failed to generate audio for scheduled fetch:`, audioError);
      // Continue without audio - summary is still valuable
    }
    
    // Save to user's summary history
    const summaryData = {
      id: `scheduled-${Date.now()}`,
      title: title,
      summary: combinedText,
      topics: allTopics,
      length: lengthCategory,
      audioUrl: audioUrl,
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
    
    // Send push notification after audio is ready
    if (audioUrl) {
      try {
        await sendNotificationToUser(
          user,
          'Daily Fetch is Ready',
          `Your scheduled news summary is ready to listen!`,
          {
            summaryId: summaryData.id,
            title: title,
            type: 'scheduled_summary_ready'
          }
        );
        console.log(`[SCHEDULER] Push notification sent to user ${user.email}`);
      } catch (notifError) {
        console.error(`[SCHEDULER] Failed to send push notification:`, notifError);
        // Don't fail the whole operation if notification fails
      }
    }
  } catch (error) {
    console.error(`[SCHEDULER] Error executing scheduled fetch for user ${user.email}:`, error);
    throw error;
  }
}

module.exports = router;
module.exports.executeScheduledSummary = executeScheduledSummary;
