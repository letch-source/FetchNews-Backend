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
  password: {
    type: String,
    required: true,
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
    audioUrl: String
  }],
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
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
  deviceTokens: {
    type: [{
      token: String,
      platform: String,
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
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

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
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
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if user can fetch news
userSchema.methods.canFetchNews = function() {
  const today = new Date().toDateString();
  const lastUsageDate = this.lastUsageDate.toDateString();
  
  // Reset daily count if it's a new day (save will happen in incrementUsage if needed)
  if (lastUsageDate !== today) {
    this.dailyUsageCount = 0;
    this.lastUsageDate = new Date();
    // Don't await here - let incrementUsage handle the save
    this.save().catch(err => console.error('[USER] Error resetting daily count:', err));
  }
  
  // Premium users have unlimited access
  if (this.isPremium) {
    return { allowed: true, reason: 'premium' };
  }
  
  // Free users limited to 1 summary per day
  if (this.dailyUsageCount >= 1) {
    return { allowed: false, reason: 'daily_limit_reached', dailyCount: this.dailyUsageCount };
  }
  
  return { allowed: true, reason: 'free_quota', dailyCount: this.dailyUsageCount };
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
  const historyEntry = {
    id: summaryData.id || Date.now().toString(),
    title: summaryData.title,
    summary: summaryData.summary,
    topics: summaryData.topics || [],
    length: summaryData.length || 'short',
    timestamp: new Date(),
    audioUrl: summaryData.audioUrl,
    sources: summaryData.sources || []
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
