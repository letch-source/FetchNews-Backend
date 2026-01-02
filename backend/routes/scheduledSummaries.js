const express = require('express');
const { authenticateToken } = require('../middleware/auth');
// Note: Functions from index.js are imported lazily inside executeScheduledSummary to avoid circular dependency
const User = require('../models/User');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const { uploadAudioToB2, isB2Configured } = require('../utils/b2Storage');
const { sendScheduledSummaryNotification } = require('../utils/notifications');

const router = express.Router();

// Helper function to split text into chunks at sentence boundaries
function splitTextIntoChunks(text, maxChunkSize = 4000) {
  if (text.length <= maxChunkSize) {
    return [text];
  }
  
  const chunks = [];
  let currentChunk = '';
  
  // Split by sentences (., !, ?)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  for (const sentence of sentences) {
    // If a single sentence is too long, split it by clauses (commas)
    if (sentence.length > maxChunkSize) {
      const clauses = sentence.split(/,\s*/);
      for (const clause of clauses) {
        if ((currentChunk + clause).length > maxChunkSize) {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = clause;
        } else {
          currentChunk += (currentChunk ? ', ' : '') + clause;
        }
      }
    } else {
      // Normal sentence handling
      if ((currentChunk + sentence).length > maxChunkSize) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Helper function to determine time-based fetch name
// Returns "Morning Fetch", "Afternoon Fetch", or "Evening Fetch" based on provided time
// If no timestamp is provided, uses current time
function getTimeBasedFetchName(timestamp = null) {
  const date = timestamp ? new Date(timestamp) : new Date();
  const hour = date.getHours();
  
  // Morning: 5:00 AM - 11:59 AM (5-11)
  if (hour >= 5 && hour < 12) {
    return "Morning Fetch";
  }
  // Afternoon: 12:00 PM - 4:59 PM (12-16)
  else if (hour >= 12 && hour < 17) {
    return "Afternoon Fetch";
  }
  // Evening: 5:00 PM - 4:59 AM (17-23 or 0-4)
  else {
    return "Evening Fetch";
  }
}

// Helper function to save user with retry logic for version conflicts
// Preserves all changes made to the user object, not just scheduledSummaries
async function saveUserWithRetry(user, retries = 3) {
  let currentUser = user;
  
  while (retries > 0) {
    try {
      await currentUser.save();
      // Update the original user reference with the saved user's data
      if (currentUser !== user) {
        Object.keys(currentUser.toObject()).forEach(key => {
          if (key !== '_id' && key !== '__v') {
            user[key] = currentUser[key];
          }
        });
      }
      return currentUser;
    } catch (error) {
      if (error.name === 'VersionError' && retries > 1) {
        retries--; // Decrement retry counter
        console.log(`[SCHEDULED_SUMMARY] Version conflict, retrying... (${retries} retries left)`);
        
        // Reload the document to get the latest version
        const freshUser = await User.findById(currentUser._id);
        if (!freshUser) {
          throw new Error('User not found during retry');
        }
        
        // Preserve all changes from the current user object before reloading
        const modifiedPaths = currentUser.modifiedPaths();
        const changesToPreserve = {};
        
        // Store all modified values - deep clone to avoid reference issues
        // Use a more robust method to get values that handles all field types
        for (const path of modifiedPaths) {
          try {
            // Try to get the value using get() first
            let value = currentUser.get(path);
            
            // If get() returns undefined, try accessing directly
            if (value === undefined) {
              const pathParts = path.split('.');
              let obj = currentUser;
              for (const part of pathParts) {
                if (obj && typeof obj === 'object' && part in obj) {
                  obj = obj[part];
                } else {
                  obj = undefined;
                  break;
                }
              }
              value = obj;
            }
            
            // Preserve the value if it's not undefined (null is valid)
            if (value !== undefined) {
              // Deep clone objects and arrays to avoid reference issues
              if (typeof value === 'object' && value !== null && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
                try {
                  changesToPreserve[path] = JSON.parse(JSON.stringify(value));
                } catch (cloneError) {
                  // If deep clone fails, use the value directly
                  changesToPreserve[path] = value;
                }
              } else {
                changesToPreserve[path] = value;
              }
            }
          } catch (getError) {
            // If we can't get the value, skip this path
            console.warn(`[SCHEDULED_SUMMARY] Could not preserve path ${path}:`, getError.message);
          }
        }
        
        // Explicitly check for common fields that might have been modified
        // This ensures we don't miss any fields even if modifiedPaths() doesn't catch them
        const fieldsToCheck = [
          'scheduledSummaries',
          'summaryHistory',
          'dailyUsageCount',
          'lastUsageDate',
          'preferences',
          'resetPasswordToken',
          'resetPasswordExpires',
          'emailVerificationToken',
          'emailVerificationExpires',
          'selectedVoice',
          'playbackRate',
          'upliftingNewsOnly',
          'lastFetchedTopics',
          'selectedTopics',
          'excludedNewsSources',
          'selectedCountry'
        ];
        
        for (const field of fieldsToCheck) {
          if (currentUser.isModified(field)) {
            const value = currentUser[field];
            if (value !== undefined) {
              if (typeof value === 'object' && value !== null && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
                try {
                  changesToPreserve[field] = JSON.parse(JSON.stringify(value));
                } catch (cloneError) {
                  changesToPreserve[field] = value;
                }
              } else {
                changesToPreserve[field] = value;
              }
            }
          }
        }
        
        // Apply our preserved changes to the fresh user
        for (const [path, value] of Object.entries(changesToPreserve)) {
          try {
            freshUser.set(path, value);
            freshUser.markModified(path);
          } catch (setError) {
            console.warn(`[SCHEDULED_SUMMARY] Could not set path ${path}:`, setError.message);
          }
        }
        
        // Update currentUser to freshUser and continue the loop to retry the save
        // This allows the while loop to handle any version conflicts that might occur
        // when saving the fresh user with our merged changes
        currentUser = freshUser;
        
        // Continue the while loop to retry the save
        continue;
      } else {
        // Log the error details for debugging
        if (error.name === 'VersionError') {
          console.error(`[SCHEDULED_SUMMARY] VersionError after ${retries} retries:`, {
            userId: currentUser._id,
            version: error.version,
            modifiedPaths: error.modifiedPaths || []
          });
        }
        throw error;
      }
    }
  }
  throw new Error('Failed to save user after retries');
}

// Get user's scheduled fetch (ensure one always exists)
router.get('/', authenticateToken, async (req, res) => {
  try {
    let user;
    let scheduledSummaries;
    
    // Check if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      // Reload user fresh from database to ensure we have the latest version
      // This prevents version conflicts from stale user objects
      user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get scheduled fetch from user.scheduledSummaries
      scheduledSummaries = user.scheduledSummaries || [];
      
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
    } else {
      // Use fallback authentication
      user = req.user;
      scheduledSummaries = user.scheduledSummaries || [];
      
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
        await fallbackAuth.updatePreferences(user, { scheduledSummaries });
      } else if (scheduledSummaries.length > 1) {
        // If more than one, keep only the first one
        scheduledSummaries = [scheduledSummaries[0]];
        user.scheduledSummaries = scheduledSummaries;
        await fallbackAuth.updatePreferences(user, { scheduledSummaries });
      }
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
    const { name, topics, customTopics, time, days, wordCount, isEnabled } = req.body;
    
    if (!time) {
      return res.status(400).json({ error: 'Time is required' });
    }
    
    const topicsArray = Array.isArray(topics) ? topics : (topics ? [topics] : []);
    const customTopicsArray = Array.isArray(customTopics) ? customTopics : (customTopics ? [customTopics] : []);
    
    let user;
    let existingSummary;
    
    // Check if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      // Reload user fresh from database to ensure we have the latest version
      // This prevents version conflicts from stale user objects
      user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get existing summary or create default
      let scheduledSummaries = user.scheduledSummaries || [];
      existingSummary = scheduledSummaries[0];
      
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
      if (isEnabled !== undefined) {
        existingSummary.isEnabled = isEnabled;
        console.log(`[SCHEDULED_SUMMARY] Setting isEnabled to ${isEnabled} for ${user.email}`);
      }
      existingSummary.updatedAt = new Date().toISOString();
      
      // Keep only this one summary
      user.scheduledSummaries = [existingSummary];
      
      // Mark the array as modified so Mongoose knows to save it
      user.markModified('scheduledSummaries');
      
      // Save user to database with retry logic for version conflicts
      const savedUser = await saveUserWithRetry(user);
      
      // Safety check: ensure savedUser is valid
      if (!savedUser) {
        throw new Error('Failed to save user: savedUser is undefined');
      }
      
      // Get the updated summary from the saved user
      const updatedSummary = savedUser.scheduledSummaries?.[0] || existingSummary;
      
      res.status(200).json({ 
        message: 'Scheduled fetch updated successfully',
        scheduledSummary: updatedSummary 
      });
    } else {
      // Use fallback authentication
      user = req.user;
      
      // Get existing summary or create default
      let scheduledSummaries = user.scheduledSummaries || [];
      existingSummary = scheduledSummaries[0];
      
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
      if (isEnabled !== undefined) {
        existingSummary.isEnabled = isEnabled;
        console.log(`[SCHEDULED_SUMMARY] Setting isEnabled to ${isEnabled} for ${user.email}`);
      }
      existingSummary.updatedAt = new Date().toISOString();
      
      // Keep only this one summary
      user.scheduledSummaries = [existingSummary];
      
      // Save to fallback auth
      await fallbackAuth.updatePreferences(user, { scheduledSummaries: user.scheduledSummaries });
      
      res.status(200).json({ 
        message: 'Scheduled fetch updated successfully',
        scheduledSummary: existingSummary 
      });
    }
  } catch (error) {
    console.error('Create/Update scheduled fetch error:', error);
    // Log detailed error information for version conflicts
    if (error.name === 'VersionError') {
      console.error('[SCHEDULED_SUMMARY] VersionError details:', {
        userId: req.user._id,
        version: error.version,
        modifiedPaths: error.modifiedPaths || [],
        message: error.message
      });
    }
    res.status(500).json({ error: 'Failed to save scheduled fetch' });
  }
});

// Update a scheduled fetch (users always have exactly one)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, topics, customTopics, time, days, wordCount, isEnabled, timezone } = req.body;
    
    let user;
    let existingSummary;
    
    // Check if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      // Reload user fresh from database to ensure we have the latest version
      // This prevents version conflicts from stale user objects
      user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Update timezone if provided
      if (timezone) {
        if (!user.preferences) {
          user.preferences = {};
        }
        user.preferences.timezone = timezone;
        user.markModified('preferences');
      }
      
      let scheduledSummaries = user.scheduledSummaries || [];
      existingSummary = scheduledSummaries[0];
      
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
      // Important: topics and customTopics should always be arrays
      if (topics !== undefined) {
        existingSummary.topics = Array.isArray(topics) ? topics : (topics ? [topics] : []);
        console.log(`[SCHEDULED_SUMMARY] Updating topics for ${user.email}: ${existingSummary.topics.length} topics - ${JSON.stringify(existingSummary.topics)}`);
      }
      if (customTopics !== undefined) {
        existingSummary.customTopics = Array.isArray(customTopics) ? customTopics : (customTopics ? [customTopics] : []);
        console.log(`[SCHEDULED_SUMMARY] Updating customTopics for ${user.email}: ${existingSummary.customTopics.length} topics - ${JSON.stringify(existingSummary.customTopics)}`);
      }
      if (time !== undefined) existingSummary.time = time;
      if (days !== undefined) {
        existingSummary.days = Array.isArray(days) ? days : (days ? [days] : []);
      }
      if (wordCount !== undefined) existingSummary.wordCount = wordCount;
      if (isEnabled !== undefined) {
        existingSummary.isEnabled = isEnabled;
        console.log(`[SCHEDULED_SUMMARY] Setting isEnabled to ${isEnabled} for ${user.email}`);
      }
      
      existingSummary.updatedAt = new Date().toISOString();
      
      // Keep only this one summary
      user.scheduledSummaries = [existingSummary];
      
      // Mark the array as modified so Mongoose knows to save it
      user.markModified('scheduledSummaries');
      
      // Save user to database with retry logic for version conflicts
      const savedUser = await saveUserWithRetry(user);
      
      // Safety check: ensure savedUser is valid
      if (!savedUser) {
        throw new Error('Failed to save user: savedUser is undefined');
      }
      
      // Get the updated summary from the saved user
      const updatedSummary = savedUser.scheduledSummaries?.[0] || existingSummary;
      
      // Log final state for debugging
      console.log(`[SCHEDULED_SUMMARY] Updated scheduled fetch for ${savedUser.email} - topics: ${updatedSummary.topics?.length || 0}, customTopics: ${updatedSummary.customTopics?.length || 0}, isEnabled: ${updatedSummary.isEnabled}, timezone: ${savedUser.preferences?.timezone || 'not set'}`);
      
      // Return the scheduled summary directly (frontend expects this format)
      res.json(updatedSummary);
    } else {
      // Use fallback authentication
      user = req.user;
      
      // Update timezone if provided
      if (timezone) {
        if (!user.preferences) {
          user.preferences = {};
        }
        user.preferences.timezone = timezone;
      }
      
      let scheduledSummaries = user.scheduledSummaries || [];
      existingSummary = scheduledSummaries[0];
      
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
      if (topics !== undefined) {
        existingSummary.topics = Array.isArray(topics) ? topics : (topics ? [topics] : []);
        console.log(`[SCHEDULED_SUMMARY] Updating topics for ${user.email}: ${existingSummary.topics.length} topics - ${JSON.stringify(existingSummary.topics)}`);
      }
      if (customTopics !== undefined) {
        existingSummary.customTopics = Array.isArray(customTopics) ? customTopics : (customTopics ? [customTopics] : []);
        console.log(`[SCHEDULED_SUMMARY] Updating customTopics for ${user.email}: ${existingSummary.customTopics.length} topics - ${JSON.stringify(existingSummary.customTopics)}`);
      }
      if (time !== undefined) existingSummary.time = time;
      if (days !== undefined) {
        existingSummary.days = Array.isArray(days) ? days : (days ? [days] : []);
      }
      if (wordCount !== undefined) existingSummary.wordCount = wordCount;
      if (isEnabled !== undefined) {
        existingSummary.isEnabled = isEnabled;
        console.log(`[SCHEDULED_SUMMARY] Setting isEnabled to ${isEnabled} for ${user.email}`);
      }
      
      existingSummary.updatedAt = new Date().toISOString();
      
      // Keep only this one summary
      user.scheduledSummaries = [existingSummary];
      
      // Save to fallback auth
      await fallbackAuth.updatePreferences(user, { scheduledSummaries: user.scheduledSummaries });
      
      // Log final state for debugging
      console.log(`[SCHEDULED_SUMMARY] Updated scheduled fetch for ${user.email} (fallback) - topics: ${existingSummary.topics?.length || 0}, customTopics: ${existingSummary.customTopics?.length || 0}, isEnabled: ${existingSummary.isEnabled}, timezone: ${user.preferences?.timezone || 'not set'}`);
      
      // Return the scheduled summary directly (frontend expects this format)
      res.json(existingSummary);
    }
  } catch (error) {
    console.error('Update scheduled fetch error:', error);
    // Log detailed error information for version conflicts
    if (error.name === 'VersionError') {
      console.error('[SCHEDULED_SUMMARY] VersionError details:', {
        userId: req.user._id,
        version: error.version,
        modifiedPaths: error.modifiedPaths || [],
        message: error.message
      });
    }
    res.status(500).json({ error: 'Failed to update scheduled fetch' });
  }
});

// Delete a scheduled summary
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    let user;
    
    // Check if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      // Reload user fresh from database to ensure we have the latest version
      // This prevents version conflicts from stale user objects
      user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
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
    } else {
      // Use fallback authentication
      user = req.user;
      
      const scheduledSummaries = user.scheduledSummaries || [];
      
      const summaryIndex = scheduledSummaries.findIndex(s => s.id === id);
      if (summaryIndex === -1) {
        return res.status(404).json({ error: 'Scheduled fetch not found' });
      }
      
      // Remove the scheduled summary
      scheduledSummaries.splice(summaryIndex, 1);
      user.scheduledSummaries = scheduledSummaries;
      
      // Save to fallback auth
      await fallbackAuth.updatePreferences(user, { scheduledSummaries: user.scheduledSummaries });
    }
    
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
    // Lazy require to avoid circular dependency with index.js
    const { fetchArticlesForTopic, summarizeArticles, addIntroAndOutro, combineTopicSummaries, filterRelevantArticles, isUpliftingNews } = require('../index');
    
    console.log(`[SCHEDULER] Executing scheduled fetch "${summary.name}" for user ${user.email}`);
    
    // Get user preferences
    const preferences = user.getPreferences ? user.getPreferences() : {};
    const wordCount = summary.wordCount || parseInt(preferences.length || '200', 10);
    const goodNewsOnly = preferences.upliftingNewsOnly || false;
    const location = user.location || '';
    const selectedVoice = user.selectedVoice || 'alloy';
    const playbackRate = user.playbackRate || 1.0;
    // Get user's country preference (default to 'us' if not set)
    const userCountry = preferences.selectedCountry || 'us';
    
    // Combine regular topics and custom topics
    const allTopics = [...(summary.topics || []), ...(summary.customTopics || [])];
    console.log(`[SCHEDULER] Topics for ${user.email}: regular=${(summary.topics || []).length}, custom=${(summary.customTopics || []).length}, total=${allTopics.length}`);
    console.log(`[SCHEDULER] Regular topics: ${JSON.stringify(summary.topics || [])}`);
    console.log(`[SCHEDULER] Custom topics: ${JSON.stringify(summary.customTopics || [])}`);
    
    if (allTopics.length === 0) {
      console.log(`[SCHEDULER] No topics to generate summary for user ${user.email}`);
      return;
    }
    
    // Check for global excluded news sources first (admin override)
    let excludedSources = [];
    const GlobalSettings = require('../models/GlobalSettings');
    const globalSettings = await GlobalSettings.getOrCreate();
    
    if (globalSettings.excludedNewsSourcesEnabled && globalSettings.excludedNewsSources && globalSettings.excludedNewsSources.length > 0) {
      // Use global excluded sources (override user exclusions)
      excludedSources = globalSettings.excludedNewsSources;
      console.log(`[SCHEDULER] Excluding ${excludedSources.length} global news sources for user ${user.email}:`, excludedSources);
    } else {
      // Get user's excluded news sources (if premium)
      if (user.isPremium && user.getPreferences) {
        excludedSources = preferences.excludedNewsSources || [];
        console.log(`[SCHEDULER] User ${user.email} has ${excludedSources.length} sources excluded:`, excludedSources);
      }
    }
    
    // For US users, use only allowed sources via NewsAPI filtering
    // For other countries, fetch from all sources and filter afterwards
    let selectedSources = [];
    if (userCountry && userCountry.toLowerCase() === 'us') {
      const { getUSNewsAPISources } = require('../index');
      selectedSources = getUSNewsAPISources();
      console.log(`[SCHEDULER US SOURCES] Using ${selectedSources.length} allowed US sources via NewsAPI`);
    }
    
    const items = [];
    const summariesWithTopics = [];
    
    // Helper function to process a single topic (extracted for parallelization)
    async function processTopic(topic) {
      try {
        const perTopic = wordCount >= 1500 ? 20 : wordCount >= 800 ? 12 : 6;
        
        // Handle location and country preference
        let geoData = null;
        if (location && typeof location === 'string') {
          const locationStr = String(location).trim();
          if (locationStr) {
            const parts = locationStr.split(',').map(p => p.trim());
            geoData = {
              city: parts[0] || "",
              region: parts[1] || "",
              country: userCountry.toUpperCase() || "US",
              countryCode: userCountry.toLowerCase() || "us"
            };
          }
        } else {
          // Even without location, use the user's country preference
          geoData = {
            city: "",
            region: "",
            country: userCountry.toUpperCase() || "US",
            countryCode: userCountry.toLowerCase() || "us"
          };
        }
        
        // Debug: Log country information for scheduled summaries
        console.log(`[SCHEDULER] Topic: ${topic}, Country: ${geoData.countryCode || geoData.country || 'none'}, GeoData:`, JSON.stringify(geoData));
        
        // Fetch articles for the topic
        let { articles } = await fetchArticlesForTopic(topic, geoData, perTopic, selectedSources);
        
        // Filter out excluded sources (if any)
        if (excludedSources && excludedSources.length > 0) {
          const { normalizeSourceName } = require('../index');
          const excludedSet = new Set(excludedSources.map(s => s.toLowerCase()));
          articles = articles.filter(article => {
            const articleSource = normalizeSourceName(article.source);
            return !excludedSet.has(articleSource);
          });
          console.log(`[SCHEDULER] Filtered out excluded sources, ${articles.length} articles remaining`);
        }
        
        // For US users: post-filter as fallback (API-level filtering should handle most cases)
        if (userCountry && userCountry.toLowerCase() === 'us' && selectedSources.length === 0) {
          // Only post-filter if we didn't use API-level filtering (shouldn't happen, but safety check)
          const { isSourceAllowedForUS } = require('../index');
          const beforeCount = articles.length;
          articles = articles.filter(article => {
            return isSourceAllowedForUS(article.source);
          });
          console.log(`[SCHEDULER US FILTER FALLBACK] Post-filtered to allowed US sources: ${beforeCount} -> ${articles.length} articles`);
        }
        
        // Filter relevant articles
        let relevant = filterRelevantArticles(topic, geoData, articles, perTopic);
        
        // Apply uplifting news filter if enabled
        if (goodNewsOnly) {
          relevant = relevant.filter(isUpliftingNews);
        }
        
        // Generate summary
        const summaryText = await summarizeArticles(topic, geoData, relevant, wordCount, goodNewsOnly, user);
        
        // Create source items
        const sourceItems = relevant.map((a, idx) => ({
          id: `${topic}-${idx}-${Date.now()}`,
          title: a.title || "",
          summary: (a.description || a.title || "").replace(/\s+/g, " ").trim().slice(0, 180),
          source: a.source || "",
          url: a.url || "",
          topic,
          imageUrl: a.urlToImage || "",
        }));
        
        return {
          summary: summaryText,
          sourceItems
        };
      } catch (innerErr) {
        console.error(`[SCHEDULER] Error processing topic ${topic} for user ${user.email}:`, innerErr);
        return {
          summary: null,
          sourceItems: []
        };
      }
    }
    
    // Process all topics in parallel for better performance
    const topicResults = await Promise.all(allTopics.map(topic => processTopic(topic)));
    
    // Combine results from parallel processing, tracking which summary belongs to which topic
    for (let i = 0; i < topicResults.length; i++) {
      const result = topicResults[i];
      const topic = allTopics[i];
      if (result.summary) {
        summariesWithTopics.push({ summary: result.summary, topic: topic });
      }
      items.push(...result.sourceItems);
    }
    
    // Combine all topic summaries with varied transitions
    let combinedText = combineTopicSummaries(summariesWithTopics);
    
    // Validate that we have actual summary content before proceeding
    // If no topics succeeded, don't save or increment usage
    if (summariesWithTopics.length === 0 || !combinedText || combinedText.trim().length === 0) {
      console.log(`[SCHEDULER] No valid summary generated for user ${user.email} - all topics failed or returned empty summaries`);
      console.log(`[SCHEDULER] Skipping save and usage increment for scheduled fetch "${summary.name}"`);
      return; // Exit early without saving or incrementing usage
    }
    
    // Add intro and outro
    combinedText = addIntroAndOutro(combinedText, allTopics, goodNewsOnly, user);
    
    // Double-check that we still have content after adding intro/outro
    if (!combinedText || combinedText.trim().length === 0) {
      console.log(`[SCHEDULER] Summary became empty after adding intro/outro for user ${user.email}`);
      console.log(`[SCHEDULER] Skipping save and usage increment for scheduled fetch "${summary.name}"`);
      return; // Exit early without saving or incrementing usage
    }
    
    // Generate title
    let title = "Scheduled Fetch";
    if (allTopics.length === 1) {
      title = `${allTopics[0].charAt(0).toUpperCase() + allTopics[0].slice(1)} Summary`;
    } else if (allTopics.length > 1) {
      // Check if this is a Daily Fetch scheduled summary
      if (summary.name === "Daily Fetch") {
        title = "Daily Fetch";
      } else {
        title = getTimeBasedFetchName();
      }
    }
    
    // Determine length category
    let lengthCategory = 'short';
    if (wordCount >= 1000) {
      lengthCategory = 'long';
    } else if (wordCount >= 800) {
      lengthCategory = 'medium';
    }
    
    // Generate audio for the summary
    let audioUrl = null;
    try {
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      if (OPENAI_API_KEY) {
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
        
        // Split text into chunks if it exceeds OpenAI's 4096 character limit
        const maxChunkLength = 4000;
        const textChunks = splitTextIntoChunks(cleaned, maxChunkLength);
        
        console.log(`[SCHEDULER] TTS processing ${textChunks.length} chunk(s) for total ${cleaned.length} characters`);
        
        // Generate TTS
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        const normalizedVoice = String(selectedVoice || "alloy").toLowerCase();
        const availableVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
        const voiceToUse = availableVoices.includes(normalizedVoice) ? normalizedVoice : "alloy";
        
        const modelPriority = ["tts-1", "tts-1-hd"];
        let finalBuffer = null;
        let lastErr = null;
        
        // Generate audio for each chunk
        for (let chunkIndex = 0; chunkIndex < textChunks.length; chunkIndex++) {
          const chunk = textChunks[chunkIndex];
          console.log(`[SCHEDULER] Generating audio for chunk ${chunkIndex + 1}/${textChunks.length} (${chunk.length} chars)`);
          
          let chunkSpeech = null;
          
          // Try models in order for this chunk
          for (const model of modelPriority) {
            try {
              console.log(`[SCHEDULER] TTS Attempt - Chunk ${chunkIndex + 1}, Model: ${model}, Voice: ${voiceToUse}`);
              chunkSpeech = await openai.audio.speech.create({
                model,
                voice: voiceToUse,
                input: chunk,
                format: "mp3",
              });
              if (chunkSpeech) {
                console.log(`[SCHEDULER] TTS Success - Chunk ${chunkIndex + 1}, Model: ${model}`);
                break;
              }
            } catch (e) {
              lastErr = e;
              console.error(`[SCHEDULER] TTS chunk ${chunkIndex + 1} failed with ${model}/${voiceToUse}:`, e.message);
            }
          }
          
          // If selected voice failed, try fallback to alloy
          if (!chunkSpeech && voiceToUse !== "alloy") {
            console.log(`[SCHEDULER] TTS Fallback - Chunk ${chunkIndex + 1}, trying alloy voice`);
            for (const model of modelPriority) {
              try {
                chunkSpeech = await openai.audio.speech.create({
                  model,
                  voice: "alloy",
                  input: chunk,
                  format: "mp3",
                });
                if (chunkSpeech) {
                  console.log(`[SCHEDULER] TTS Fallback Success - Chunk ${chunkIndex + 1}, Model: ${model}`);
                  break;
                }
              } catch (e) {
                lastErr = e;
                console.error(`[SCHEDULER] TTS chunk ${chunkIndex + 1} fallback failed with ${model}/alloy:`, e.message);
              }
            }
          }
          
          if (!chunkSpeech) {
            throw lastErr || new Error(`Failed to generate audio for chunk ${chunkIndex + 1}`);
          }
          
          // Convert to buffer and concatenate
          const chunkBuffer = Buffer.from(await chunkSpeech.arrayBuffer());
          
          if (finalBuffer === null) {
            finalBuffer = chunkBuffer;
          } else {
            // Concatenate MP3 buffers
            finalBuffer = Buffer.concat([finalBuffer, chunkBuffer]);
          }
        }
        
        if (finalBuffer) {
          // Save audio file
          const buffer = finalBuffer;
          const fileBase = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
          
          // Upload to B2 if configured, otherwise save locally
          if (isB2Configured()) {
            try {
              console.log('[SCHEDULER] 📤 Uploading audio to Backblaze B2...');
              audioUrl = await uploadAudioToB2(buffer, fileBase);
              console.log('[SCHEDULER] ✅ Audio uploaded to B2 successfully');
            } catch (b2Error) {
              console.error('[SCHEDULER] ❌ B2 upload failed, falling back to local storage:', b2Error);
              // Fallback to local storage
              const mediaDir = path.join(__dirname, '../media');
              const filePath = path.join(mediaDir, fileBase);
              await fs.mkdir(mediaDir, { recursive: true });
              await fs.writeFile(filePath, buffer);
              const baseUrl = process.env.BASE_URL || 'https://fetchnews-backend.onrender.com';
              audioUrl = `${baseUrl}/media/${fileBase}`;
            }
          } else {
            console.log('[SCHEDULER] ⚠️  B2 not configured, using local storage');
            const mediaDir = path.join(__dirname, '../media');
            const filePath = path.join(mediaDir, fileBase);
            await fs.mkdir(mediaDir, { recursive: true });
            await fs.writeFile(filePath, buffer);
            const baseUrl = process.env.BASE_URL || 'https://fetchnews-backend.onrender.com';
            audioUrl = `${baseUrl}/media/${fileBase}`;
          }
          
          console.log(`[SCHEDULER] Audio generated for scheduled fetch "${title}"`);
        }
      }
    } catch (audioError) {
      console.error(`[SCHEDULER] Failed to generate audio for scheduled fetch:`, audioError);
      // Continue without audio - summary is still valuable
    }
    
    // Save to user's summary history (only if we have valid content)
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
      
      // Increment usage - only increment if we successfully generated and saved a valid summary
      user.dailyUsageCount += 1;
      user.lastUsageDate = new Date();
      
      // Single save for both operations with retry logic for version conflicts
      await saveUserWithRetry(user);
    } else {
      await fallbackAuth.addSummaryToHistory(user, summaryData);
      await fallbackAuth.incrementUsage(user);
    }
    
    // Send push notification if enabled and token is available
    const notificationPrefs = user.notificationPreferences || {};
    const notificationsEnabled = notificationPrefs.scheduledSummaryNotifications !== false;
    
    console.log(`[SCHEDULER] Notification check for user ${user.email}:`);
    console.log(`[SCHEDULER]   - Notifications enabled: ${notificationsEnabled}`);
    console.log(`[SCHEDULER]   - Notification prefs:`, JSON.stringify(notificationPrefs));
    
    if (notificationsEnabled) {
      try {
        let deviceToken = null;
        if (mongoose.connection.readyState === 1) {
          deviceToken = user.deviceToken;
        } else {
          // Fallback mode - get from preferences
          deviceToken = user.preferences?.deviceToken || null;
        }
        
        console.log(`[SCHEDULER]   - Device token: ${deviceToken ? `${deviceToken.substring(0, 8)}...` : 'NOT FOUND'}`);
        
        if (deviceToken) {
          console.log(`[SCHEDULER]   - Sending notification for "${title}"...`);
          const notificationResult = await sendScheduledSummaryNotification(deviceToken, title, summaryData.id);
          
          if (notificationResult === 'BAD_TOKEN') {
            // Invalid token - clear it from user record
            console.log(`[SCHEDULER] ⚠️  Invalid device token detected, clearing token for user ${user.email}`);
            if (mongoose.connection.readyState === 1) {
              const freshUser = await User.findById(user._id || user.id);
              if (freshUser) {
                freshUser.deviceToken = null;
                await freshUser.save();
              }
            } else {
              if (user.preferences) {
                user.preferences.deviceToken = null;
                await fallbackAuth.updatePreferences(user, user.preferences);
              }
            }
          } else if (notificationResult) {
            console.log(`[SCHEDULER] ✅ Successfully sent push notification for scheduled summary "${title}" to user ${user.email}`);
          } else {
            console.log(`[SCHEDULER] ⚠️  Failed to send notification for user ${user.email}`);
          }
        } else {
          console.log(`[SCHEDULER] ⚠️  No device token found for user ${user.email}, skipping push notification`);
        }
      } catch (notificationError) {
        // Don't fail the entire operation if notification fails
        console.error(`[SCHEDULER] ❌ Failed to send push notification for user ${user.email}:`, notificationError);
        console.error(`[SCHEDULER] ❌ Error stack:`, notificationError.stack);
      }
    } else {
      console.log(`[SCHEDULER] ℹ️  Scheduled summary notifications disabled for user ${user.email}`);
    }
    
    console.log(`[SCHEDULER] Successfully generated and saved summary "${title}" for user ${user.email}`);
  } catch (error) {
    console.error(`[SCHEDULER] Error executing scheduled fetch for user ${user.email}:`, error);
    throw error;
  }
}

module.exports = router;
module.exports.executeScheduledSummary = executeScheduledSummary;
