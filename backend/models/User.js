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
  
  // Reset daily count if it's a new day
  if (lastUsageDate !== today) {
    this.dailyUsageCount = 0;
    this.lastUsageDate = new Date();
    this.save();
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

// Summary history management
userSchema.methods.addSummaryToHistory = async function(summaryData) {
  const historyEntry = {
    id: summaryData.id || Date.now().toString(),
    title: summaryData.title,
    summary: summaryData.summary,
    topics: summaryData.topics || [],
    length: summaryData.length || 'short',
    timestamp: new Date(),
    audioUrl: summaryData.audioUrl
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
    lastFetchedTopics: this.lastFetchedTopics || [],
    selectedTopics: this.selectedTopics || [],
    selectedNewsSources: this.selectedNewsSources || [],
    scheduledSummaries: this.scheduledSummaries || []
  };
};

userSchema.methods.updatePreferences = async function(preferences) {
  this.selectedVoice = preferences.selectedVoice || this.selectedVoice;
  this.playbackRate = preferences.playbackRate || this.playbackRate;
  this.upliftingNewsOnly = preferences.upliftingNewsOnly || this.upliftingNewsOnly;
  this.lastFetchedTopics = preferences.lastFetchedTopics || this.lastFetchedTopics;
  this.selectedTopics = preferences.selectedTopics || this.selectedTopics;
  this.selectedNewsSources = preferences.selectedNewsSources || this.selectedNewsSources;
  this.scheduledSummaries = preferences.scheduledSummaries || this.scheduledSummaries;
  
  await this.save();
  return this.getPreferences();
};

module.exports = mongoose.model('User', userSchema);
