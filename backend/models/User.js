const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  googleId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    default: null
  },
  password: {
    type: String,
    required: false,
    minlength: 6
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  subscriptionId: {
    type: String,
    default: null
  },
  subscriptionExpiresAt: {
    type: Date,
    default: null
  },
  dailyUsageCount: {
    type: Number,
    default: 0
  },
  lastUsageDate: {
    type: Date,
    default: Date.now
  },
  customTopics: {
    type: [String],
    default: []
  },
  summaryHistory: [{
    id: String,
    title: String,
    summary: String,
    topics: [String],
    length: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    audioUrl: String,
    sources: [{
      id: String,
      title: String,
      summary: String,
      source: String,
      url: String,
      topic: String
    }]
  }],
  savedSummaries: [{
    id: String,
    title: String,
    summary: String,
    topics: [String],
    length: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    savedAt: {
      type: Date,
      default: Date.now
    },
    audioUrl: String,
    sources: [{
      id: String,
      title: String,
      summary: String,
      source: String,
      url: String,
      topic: String
    }]
  }],
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  // User preferences
  selectedVoice: {
    type: String,
    default: 'alloy'
  },
  playbackRate: {
    type: Number,
    default: 1.0
  },
  upliftingNewsOnly: {
    type: Boolean,
    default: false
  },
  summaryLength: {
    type: String,
    default: '200'
  },
  lastFetchedTopics: {
    type: [String],
    default: []
  },
  selectedTopics: {
    type: [String],
    default: []
  },
  excludedNewsSources: {
    type: [String],
    default: []
  },
  // Legacy field for migration (deprecated)
  selectedNewsSources: {
    type: [String],
    default: []
  },
  selectedCountry: {
    type: String,
    default: 'us'
  },
  scheduledSummaries: {
    type: [Object],
    default: []
  },
  // Article feedback for personalization
  likedArticles: [{
    articleId: String,
    url: String,
    title: String,
    source: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  dislikedArticles: [{
    articleId: String,
    url: String,
    title: String,
    source: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  preferences: {
    type: Object,
    default: () => ({ length: '200' }) // Initialize with default length
  },
  deviceToken: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure googleId is always present before saving (Google-only authentication)
userSchema.pre('save', async function(next) {
  if (!this.googleId) {
    return next(new Error('Google ID is required. Please sign in with Google.'));
  }
  next();
});

// Hash password before saving (only if password is provided)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false; // Google-authenticated users don't have passwords
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Helper function to get date string in PST timezone
function getDateStringInPST(date = new Date()) {
  // Get date components in PST (America/Los_Angeles timezone)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  
  // Create a date object from PST date components and return its date string
  // This ensures consistent format matching toDateString()
  const pstDate = new Date(`${year}-${month}-${day}T00:00:00`);
  return pstDate.toDateString();
}

// Check if user can fetch news
userSchema.methods.canFetchNews = async function() {
  // Get today's date string in PST timezone (resets at midnight PST)
  const now = new Date();
  const today = getDateStringInPST(now);
  
  // Handle null/undefined lastUsageDate - treat as needing reset
  let lastUsageDateStr = today;
  if (this.lastUsageDate) {
    lastUsageDateStr = getDateStringInPST(new Date(this.lastUsageDate));
  }
  
  // Reset daily count if it's a new day (resets at midnight PST)
  // The date string comparison ensures reset happens when date changes in PST
  if (lastUsageDateStr !== today) {
    console.log(`[USAGE] Resetting daily count for user ${this.email}: lastUsageDate=${lastUsageDateStr}, today=${today}, oldCount=${this.dailyUsageCount}`);
    this.dailyUsageCount = 0;
    this.lastUsageDate = now;
    // Await the save to ensure the reset is persisted before checking
    await this.save();
    console.log(`[USAGE] Reset complete: newCount=${this.dailyUsageCount}`);
  }
  
  // Define limits
  const freeUserLimit = 3;
  const premiumUserLimit = 20;
  
  // Premium users limited to 20 summaries per day
  if (this.isPremium) {
    if (this.dailyUsageCount >= premiumUserLimit) {
      console.log(`[USAGE] Premium user ${this.email} reached limit: ${this.dailyUsageCount}/${premiumUserLimit}`);
      return { allowed: false, reason: 'daily_limit_reached', dailyCount: this.dailyUsageCount, limit: premiumUserLimit };
    }
    return { allowed: true, reason: 'premium', dailyCount: this.dailyUsageCount, limit: premiumUserLimit };
  }
  
  // Free users limited to 3 summaries per day
  if (this.dailyUsageCount >= freeUserLimit) {
    console.log(`[USAGE] Free user ${this.email} reached limit: ${this.dailyUsageCount}/${freeUserLimit}`);
    return { allowed: false, reason: 'daily_limit_reached', dailyCount: this.dailyUsageCount, limit: freeUserLimit };
  }
  
  return { allowed: true, reason: 'free_quota', dailyCount: this.dailyUsageCount, limit: freeUserLimit };
};

// Increment usage count
userSchema.methods.incrementUsage = async function() {
  this.dailyUsageCount += 1;
  this.lastUsageDate = new Date();
  await this.save();
};

// Custom topics management
userSchema.methods.addCustomTopic = async function(topic) {
  if (!this.customTopics.includes(topic)) {
    this.customTopics.push(topic);
    await this.save();
  }
  return this.customTopics;
};

userSchema.methods.removeCustomTopic = async function(topic) {
  this.customTopics = this.customTopics.filter(t => t !== topic);
  await this.save();
  return this.customTopics;
};

userSchema.methods.getCustomTopics = function() {
  return this.customTopics;
};

// Summary history management
userSchema.methods.addSummaryToHistory = async function(summaryData) {
  // Normalize sources array - handle both string arrays (old format) and object arrays (new format)
  let normalizedSources = [];
  if (summaryData.sources && Array.isArray(summaryData.sources)) {
    normalizedSources = summaryData.sources.map(source => {
      // If source is a string (old format), convert to object
      if (typeof source === 'string') {
        return {
          id: '',
          title: '',
          summary: '',
          source: source,
          url: '',
          topic: ''
        };
      }
      // If source is already an object, ensure it has all required fields
      if (typeof source === 'object' && source !== null) {
        return {
          id: source.id || '',
          title: source.title || '',
          summary: source.summary || '',
          source: source.source || '',
          url: source.url || '',
          topic: source.topic || ''
        };
      }
      // Skip invalid entries
      return null;
    }).filter(source => source !== null);
  }
  
  const historyEntry = {
    id: summaryData.id || Date.now().toString(),
    title: summaryData.title,
    summary: summaryData.summary,
    topics: summaryData.topics || [],
    length: summaryData.length || 'short',
    timestamp: new Date(),
    audioUrl: summaryData.audioUrl,
    sources: normalizedSources
  };
  
  // Add to beginning of array (most recent first)
  this.summaryHistory.unshift(historyEntry);
  
  // Keep only last 50 summaries to prevent database bloat
  if (this.summaryHistory.length > 50) {
    this.summaryHistory = this.summaryHistory.slice(0, 50);
  }
  
  await this.save();
  return this.summaryHistory;
};

userSchema.methods.getSummaryHistory = function() {
  return this.summaryHistory || [];
};

userSchema.methods.clearSummaryHistory = async function() {
  this.summaryHistory = [];
  await this.save();
  return this.summaryHistory;
};

// Saved summaries methods
userSchema.methods.saveSummary = async function(summaryData) {
  // Normalize sources to ensure consistent format
  let normalizedSources = null;
  if (summaryData.sources) {
    normalizedSources = summaryData.sources
      .map(source => {
        if (typeof source === 'string') {
          return { source };
        }
        return source;
      })
      .filter(source => source !== null);
  }
  
  const savedEntry = {
    id: summaryData.id || Date.now().toString(),
    title: summaryData.title,
    summary: summaryData.summary,
    topics: summaryData.topics || [],
    length: summaryData.length || 'short',
    timestamp: summaryData.timestamp || new Date(),
    savedAt: new Date(),
    audioUrl: summaryData.audioUrl,
    sources: normalizedSources
  };
  
  // Check if already saved
  const alreadySaved = this.savedSummaries.some(s => s.id === savedEntry.id);
  if (alreadySaved) {
    return this.savedSummaries;
  }
  
  // Add to beginning of array (most recent first)
  this.savedSummaries.unshift(savedEntry);
  
  // Keep only last 100 saved summaries to prevent database bloat
  if (this.savedSummaries.length > 100) {
    this.savedSummaries = this.savedSummaries.slice(0, 100);
  }
  
  await this.save();
  return this.savedSummaries;
};

userSchema.methods.unsaveSummary = async function(summaryId) {
  this.savedSummaries = this.savedSummaries.filter(s => s.id !== summaryId);
  await this.save();
  return this.savedSummaries;
};

userSchema.methods.getSavedSummaries = function() {
  return this.savedSummaries || [];
};

userSchema.methods.isSummarySaved = function(summaryId) {
  return this.savedSummaries.some(s => s.id === summaryId);
};

userSchema.methods.clearSavedSummaries = async function() {
  this.savedSummaries = [];
  await this.save();
  return this.savedSummaries;
};

// Update subscription status
userSchema.methods.updateSubscription = function(isPremium, subscriptionId = null, expiresAt = null) {
  this.isPremium = isPremium;
  this.subscriptionId = subscriptionId;
  this.subscriptionExpiresAt = expiresAt;
  return this.save();
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Clear password reset token
userSchema.methods.clearPasswordResetToken = function() {
  this.resetPasswordToken = undefined;
  this.resetPasswordExpires = undefined;
  return this.save();
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const crypto = require('crypto');
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Verify email
userSchema.methods.verifyEmail = function() {
  this.emailVerified = true;
  this.emailVerificationToken = undefined;
  this.emailVerificationExpires = undefined;
  return this.save();
};

// Preferences management
userSchema.methods.getPreferences = function() {
  // Capitalize voice name to match frontend expectations (Alloy, Echo, etc.)
  const capitalizeVoice = (voice) => {
    if (!voice) return 'Alloy';
    // Convert lowercase to capitalized (alloy -> Alloy)
    return voice.charAt(0).toUpperCase() + voice.slice(1).toLowerCase();
  };
  
  return {
    selectedVoice: capitalizeVoice(this.selectedVoice) || 'Alloy',
    playbackRate: this.playbackRate || 1.0,
    upliftingNewsOnly: this.upliftingNewsOnly || false,
    length: this.summaryLength || '200',
    lastFetchedTopics: this.lastFetchedTopics || [],
    selectedTopics: this.selectedTopics || [],
    excludedNewsSources: this.excludedNewsSources || [],
    // Legacy field for migration
    selectedNewsSources: this.excludedNewsSources || [],
    selectedCountry: this.selectedCountry || 'us',
    scheduledSummaries: this.scheduledSummaries || []
  };
};

userSchema.methods.updatePreferences = async function(preferences) {
  // Update string/number values (only if provided)
  if (preferences.selectedVoice !== undefined) {
    // Store voice in lowercase for consistency, but frontend sends capitalized
    // Convert to lowercase for storage (Alloy -> alloy)
    this.selectedVoice = preferences.selectedVoice.toLowerCase();
  }
  if (preferences.playbackRate !== undefined) {
    this.playbackRate = preferences.playbackRate;
  }
  
  // Update boolean values (explicitly check for true/false)
  if (preferences.upliftingNewsOnly !== undefined) {
    this.upliftingNewsOnly = preferences.upliftingNewsOnly;
  }
  
  // Update summary length (only if provided)
  if (preferences.length !== undefined) {
    this.summaryLength = preferences.length;
  }
  
  // Update array values (only if provided)
  if (preferences.lastFetchedTopics !== undefined) {
    this.lastFetchedTopics = preferences.lastFetchedTopics;
  }
  if (preferences.selectedTopics !== undefined) {
    this.selectedTopics = preferences.selectedTopics;
  }
  if (preferences.excludedNewsSources !== undefined) {
    this.excludedNewsSources = preferences.excludedNewsSources;
  }
  // Legacy field support for migration
  if (preferences.selectedNewsSources !== undefined) {
    // Migrate old allowlist to new blocklist
    this.excludedNewsSources = preferences.selectedNewsSources;
  }
  // Do NOT update scheduledSummaries via updatePreferences - it's managed separately via /api/scheduled-summaries
  // This prevents version conflicts when both routes try to save at the same time
  
  // Retry logic for version conflicts
  let retries = 3;
  while (retries > 0) {
    try {
      await this.save();
      console.log(`[USER] Successfully saved preferences for ${this.email} - selectedVoice: ${this.selectedVoice}`);
      return this.getPreferences();
    } catch (error) {
      retries--;
      if (error.name === 'VersionError' && retries > 0) {
        console.log(`[USER] Version conflict, retrying... (${retries} retries left)`);
        // Reload the document to get the latest version
        const freshUser = await this.constructor.findById(this._id);
        if (freshUser) {
          // Update the fresh document with our changes (merge, don't overwrite)
          if (preferences.selectedVoice !== undefined) {
            // Store voice in lowercase for consistency
            freshUser.selectedVoice = preferences.selectedVoice.toLowerCase();
          }
          if (preferences.playbackRate !== undefined) {
            freshUser.playbackRate = preferences.playbackRate;
          }
          if (preferences.upliftingNewsOnly !== undefined) {
            freshUser.upliftingNewsOnly = preferences.upliftingNewsOnly;
          }
          if (preferences.length !== undefined) {
            freshUser.summaryLength = preferences.length;
          }
          if (preferences.lastFetchedTopics !== undefined) {
            freshUser.lastFetchedTopics = preferences.lastFetchedTopics;
          }
          if (preferences.selectedTopics !== undefined) {
            freshUser.selectedTopics = preferences.selectedTopics;
          }
          if (preferences.excludedNewsSources !== undefined) {
            freshUser.excludedNewsSources = preferences.excludedNewsSources;
          }
          // Legacy field support for migration
          if (preferences.selectedNewsSources !== undefined) {
            freshUser.excludedNewsSources = preferences.selectedNewsSources;
          }
          if (preferences.selectedCountry !== undefined) {
            freshUser.selectedCountry = preferences.selectedCountry || 'us';
          }
          // Do NOT update scheduledSummaries via updatePreferences - it's managed separately via /api/scheduled-summaries
          // This prevents version conflicts when both routes try to save at the same time
          
          // Save the fresh user and copy to this instance
          try {
            await freshUser.save();
            Object.assign(this, freshUser.toObject());
            console.log(`[USER] Successfully saved preferences on retry for ${freshUser.email} - selectedVoice: ${freshUser.selectedVoice}`);
            return this.getPreferences();
          } catch (retryError) {
            console.error(`[USER] Retry save failed for ${freshUser.email}:`, retryError.message);
            if (retries === 0) {
              throw retryError;
            }
            // Continue to next retry
          }
        } else {
          console.error(`[USER] Could not find user ${this._id} during retry`);
          throw error;
        }
      } else {
        console.error(`[USER] Failed to save preferences for ${this.email}:`, error.message);
        throw error;
      }
    }
  }
  
  throw new Error('Failed to update preferences after retries');
};

module.exports = mongoose.model('User', userSchema);
