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
  password: {
    type: String,
    required: false,
    minlength: 6
  },
  isPremium: {
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
  lastFetchedTopics: {
    type: [String],
    default: []
  },
  selectedTopics: {
    type: [String],
    default: []
  },
  selectedNewsSources: {
    type: [String],
    default: []
  },
  scheduledSummaries: {
    type: [Object],
    default: []
  },
  preferences: {
    type: Object,
    default: {}
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
  const lastUsageDate = this.lastUsageDate ? getDateStringInPST(new Date(this.lastUsageDate)) : today;
  
  // Reset daily count if it's a new day (resets at midnight PST)
  // The date string comparison ensures reset happens when date changes in PST
  if (lastUsageDate !== today) {
    this.dailyUsageCount = 0;
    this.lastUsageDate = now;
    // Await the save to ensure the reset is persisted before checking
    await this.save();
  }
  
  // Define limits
  const freeUserLimit = 3;
  const premiumUserLimit = 20;
  
  // Premium users limited to 20 summaries per day
  if (this.isPremium) {
    if (this.dailyUsageCount >= premiumUserLimit) {
      return { allowed: false, reason: 'daily_limit_reached', dailyCount: this.dailyUsageCount, limit: premiumUserLimit };
    }
    return { allowed: true, reason: 'premium', dailyCount: this.dailyUsageCount, limit: premiumUserLimit };
  }
  
  // Free users limited to 3 summaries per day
  if (this.dailyUsageCount >= freeUserLimit) {
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
  return {
    selectedVoice: this.selectedVoice || 'alloy',
    playbackRate: this.playbackRate || 1.0,
    upliftingNewsOnly: this.upliftingNewsOnly || false,
    length: this.preferences?.length || '200',
    lastFetchedTopics: this.lastFetchedTopics || [],
    selectedTopics: this.selectedTopics || [],
    selectedNewsSources: this.selectedNewsSources || [],
    scheduledSummaries: this.scheduledSummaries || []
  };
};

userSchema.methods.updatePreferences = async function(preferences) {
  // Update string/number values (only if provided)
  if (preferences.selectedVoice !== undefined) {
    this.selectedVoice = preferences.selectedVoice;
  }
  if (preferences.playbackRate !== undefined) {
    this.playbackRate = preferences.playbackRate;
  }
  
  // Update boolean values (explicitly check for true/false)
  if (preferences.upliftingNewsOnly !== undefined) {
    this.upliftingNewsOnly = preferences.upliftingNewsOnly;
  }
  
  // Update array values (only if provided)
  if (preferences.lastFetchedTopics !== undefined) {
    this.lastFetchedTopics = preferences.lastFetchedTopics;
  }
  if (preferences.selectedTopics !== undefined) {
    this.selectedTopics = preferences.selectedTopics;
  }
  if (preferences.selectedNewsSources !== undefined) {
    this.selectedNewsSources = preferences.selectedNewsSources;
  }
  // Do NOT update scheduledSummaries via updatePreferences - it's managed separately via /api/scheduled-summaries
  // This prevents version conflicts when both routes try to save at the same time
  
  // Update length in preferences object
  if (!this.preferences) {
    this.preferences = {};
  }
  if (preferences.length !== undefined) {
    this.preferences.length = preferences.length;
  }
  
  // Retry logic for version conflicts
  let retries = 3;
  while (retries > 0) {
    try {
      await this.save();
      return this.getPreferences();
    } catch (error) {
      if (error.name === 'VersionError' && retries > 1) {
        console.log(`[USER] Version conflict, retrying... (${retries - 1} retries left)`);
        // Reload the document to get the latest version
        const freshUser = await this.constructor.findById(this._id);
        if (freshUser) {
          // Update the fresh document with our changes (merge, don't overwrite)
          if (preferences.selectedVoice !== undefined) {
            freshUser.selectedVoice = preferences.selectedVoice;
          }
          if (preferences.playbackRate !== undefined) {
            freshUser.playbackRate = preferences.playbackRate;
          }
          if (preferences.upliftingNewsOnly !== undefined) {
            freshUser.upliftingNewsOnly = preferences.upliftingNewsOnly;
          }
          if (preferences.length !== undefined) {
            if (!freshUser.preferences) freshUser.preferences = {};
            freshUser.preferences.length = preferences.length;
          }
          if (preferences.lastFetchedTopics !== undefined) {
            freshUser.lastFetchedTopics = preferences.lastFetchedTopics;
          }
          if (preferences.selectedTopics !== undefined) {
            freshUser.selectedTopics = preferences.selectedTopics;
          }
          if (preferences.selectedNewsSources !== undefined) {
            freshUser.selectedNewsSources = preferences.selectedNewsSources;
          }
          // Do NOT update scheduledSummaries via updatePreferences - it's managed separately via /api/scheduled-summaries
          // This prevents version conflicts when both routes try to save at the same time
          
          // Save the fresh user and copy to this instance
          await freshUser.save();
          Object.assign(this, freshUser.toObject());
          return this.getPreferences();
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
  
  throw new Error('Failed to update preferences after retries');
};

module.exports = mongoose.model('User', userSchema);
