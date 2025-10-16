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

// Update subscription status
userSchema.methods.updateSubscription = function(isPremium, subscriptionId = null, expiresAt = null) {
  this.isPremium = isPremium;
  this.subscriptionId = subscriptionId;
  this.subscriptionExpiresAt = expiresAt;
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
