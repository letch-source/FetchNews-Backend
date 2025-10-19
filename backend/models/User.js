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
  premiumSource: {
    type: String,
    enum: ['paid', 'admin_granted'],
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
  timezone: {
    type: String,
    default: 'UTC'
  },
  deviceInfo: {
    deviceModel: {
      type: String,
      default: null
    },
    deviceName: {
      type: String,
      default: null
    },
    systemVersion: {
      type: String,
      default: null
    },
    appVersion: {
      type: String,
      default: null
    }
  },
  customTopics: {
    type: [String],
    default: []
  },
  // User preferences
  preferences: {
    selectedVoice: {
      type: String,
      default: 'Alloy',
      enum: ['Alloy', 'Echo', 'Fable', 'Onyx', 'Nova', 'Shimmer']
    },
    playbackRate: {
      type: Number,
      default: 1.0,
      min: 0.5,
      max: 2.0
    },
    upliftingNewsOnly: {
      type: Boolean,
      default: false
    },
    lastFetchedTopics: {
      type: [String],
      default: []
    },
    selectedNewsSources: {
      type: [String],
      default: []
    },
    scheduledSummaries: [{
      id: String,
      name: String,
      time: String,
      topics: [String],
      customTopics: [String],
      days: [String],
      isEnabled: {
        type: Boolean,
        default: true
      },
      createdAt: String,
      lastRun: String
    }]
  },
  summaryHistory: [{
    id: String,
    title: String,
    summary: String,
    topics: [String],
    length: String,
    wordCount: Number,
    timestamp: {
      type: Date,
      default: Date.now
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    audioUrl: String,
    sources: [String]
  }],
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
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
  // Get current date in user's timezone
  const now = new Date();
  const userTimezone = this.timezone || 'UTC';
  
  // Get today's date in user's timezone
  const todayInUserTz = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  
  // Get last usage date in user's timezone
  const lastUsageInUserTz = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(this.lastUsageDate);
  
  // Reset daily count if it's a new day in user's timezone
  if (lastUsageInUserTz !== todayInUserTz) {
    this.dailyUsageCount = 0;
    this.lastUsageDate = new Date();
    this.save();
  }
  
  // Premium users have unlimited access
  if (this.isPremium) {
    return { allowed: true, reason: 'premium' };
  }
  
  // Free users limited to 10 summaries per day
  if (this.dailyUsageCount >= 10) {
    return { allowed: false, reason: 'daily_limit_reached', dailyCount: this.dailyUsageCount };
  }
  
  return { allowed: true, reason: 'free_quota', dailyCount: this.dailyUsageCount };
};

// Increment usage count
userSchema.methods.incrementUsage = function() {
  this.dailyUsageCount += 1;
  this.lastUsageDate = new Date();
  return this.save();
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

// User preferences management
userSchema.methods.updatePreferences = async function(preferences) {
  if (preferences.selectedVoice) {
    this.preferences.selectedVoice = preferences.selectedVoice;
  }
  if (preferences.playbackRate !== undefined) {
    this.preferences.playbackRate = Math.max(0.5, Math.min(2.0, preferences.playbackRate));
  }
  if (preferences.upliftingNewsOnly !== undefined) {
    this.preferences.upliftingNewsOnly = preferences.upliftingNewsOnly;
  }
  if (preferences.lastFetchedTopics) {
    this.preferences.lastFetchedTopics = preferences.lastFetchedTopics;
  }
  if (preferences.selectedNewsSources) {
    this.preferences.selectedNewsSources = preferences.selectedNewsSources;
  }
  
  await this.save();
  return this.preferences;
};

userSchema.methods.getPreferences = function() {
  return this.preferences || {
    selectedVoice: 'Alloy',
    playbackRate: 1.0,
    upliftingNewsOnly: false,
    lastFetchedTopics: [],
    selectedNewsSources: []
  };
};

// Summary history management
userSchema.methods.addSummaryToHistory = async function(summaryData) {
  const historyEntry = {
    id: summaryData.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: summaryData.title,
    summary: summaryData.summary,
    topics: summaryData.topics || [],
    length: summaryData.length || 'short',
    wordCount: summaryData.wordCount || 0,
    timestamp: new Date(),
    createdAt: new Date(),
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

// Remove specific summary from history
userSchema.methods.removeSummaryFromHistory = async function(summaryId) {
  this.summaryHistory = this.summaryHistory.filter(entry => entry.id !== summaryId);
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

// Update device information
userSchema.methods.updateDeviceInfo = function(deviceInfo) {
  if (deviceInfo.deviceModel) {
    this.deviceInfo.deviceModel = deviceInfo.deviceModel;
  }
  if (deviceInfo.deviceName) {
    this.deviceInfo.deviceName = deviceInfo.deviceName;
  }
  if (deviceInfo.systemVersion) {
    this.deviceInfo.systemVersion = deviceInfo.systemVersion;
  }
  if (deviceInfo.appVersion) {
    this.deviceInfo.appVersion = deviceInfo.appVersion;
  }
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

module.exports = mongoose.model('User', userSchema);
