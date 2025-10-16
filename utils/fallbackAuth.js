// Fallback authentication when database is not available
// This is a temporary solution for development/testing

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';

// Simple in-memory user store (for development only)
const fallbackUsers = new Map();

// Create a fallback user for testing
const createFallbackUser = async () => {
  const email = 'test@example.com';
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const user = {
    _id: 'fallback-user-id',
    email,
    password: hashedPassword,
    isPremium: false,
    dailyUsageCount: 0,
    lastUsageDate: new Date(),
    subscriptionId: null,
    subscriptionExpiresAt: null,
    customTopics: [],
    summaryHistory: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  fallbackUsers.set(email, user);
  return user;
};

// Fallback authentication functions
const fallbackAuth = {
  async findUserByEmail(email) {
    if (fallbackUsers.size === 0) {
      await createFallbackUser();
    }
    return fallbackUsers.get(email);
  },
  
  async findUserById(id) {
    if (fallbackUsers.size === 0) {
      await createFallbackUser();
    }
    // For fallback, we only have one user
    return fallbackUsers.values().next().value;
  },
  
  async createUser(email, password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      _id: `fallback-${Date.now()}`,
      email,
      password: hashedPassword,
      isPremium: false,
      dailyUsageCount: 0,
      lastUsageDate: new Date(),
      subscriptionId: null,
      subscriptionExpiresAt: null,
      customTopics: [],
      summaryHistory: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    fallbackUsers.set(email, user);
    return user;
  },
  
  async comparePassword(user, candidatePassword) {
    return bcrypt.compare(candidatePassword, user.password);
  },
  
  async updateSubscription(user, isPremium, subscriptionId = null, expiresAt = null) {
    user.isPremium = isPremium;
    user.subscriptionId = subscriptionId;
    user.subscriptionExpiresAt = expiresAt;
    user.updatedAt = new Date();
    return user;
  },

  // Custom topics management for fallback
  async addCustomTopic(user, topic) {
    if (!user.customTopics.includes(topic)) {
      user.customTopics.push(topic);
    }
    return user.customTopics;
  },

  async removeCustomTopic(user, topic) {
    user.customTopics = user.customTopics.filter(t => t !== topic);
    return user.customTopics;
  },

  getCustomTopics(user) {
    return user.customTopics || [];
  },

  // Summary history management for fallback
  async addSummaryToHistory(user, summaryData) {
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
    user.summaryHistory.unshift(historyEntry);
    
    // Keep only last 50 summaries
    if (user.summaryHistory.length > 50) {
      user.summaryHistory = user.summaryHistory.slice(0, 50);
    }
    
    return user.summaryHistory;
  },

  getSummaryHistory(user) {
    return user.summaryHistory || [];
  },

  async clearSummaryHistory(user) {
    user.summaryHistory = [];
    return user.summaryHistory;
  },
  
  canFetchNews(user) {
    const today = new Date().toDateString();
    const lastUsageDate = user.lastUsageDate.toDateString();
    
    // Reset daily count if it's a new day
    if (lastUsageDate !== today) {
      user.dailyUsageCount = 0;
      user.lastUsageDate = new Date();
    }
    
    // Premium users have unlimited access
    if (user.isPremium) {
      return { allowed: true, reason: 'premium' };
    }
    
    // Free users limited to 1 summary per day
    if (user.dailyUsageCount >= 1) {
      return { allowed: false, reason: 'daily_limit_reached', dailyCount: user.dailyUsageCount };
    }
    
    return { allowed: true, reason: 'free_quota', dailyCount: user.dailyUsageCount };
  },
  
  async incrementUsage(user) {
    user.dailyUsageCount += 1;
    user.lastUsageDate = new Date();
    return user;
  }
};

module.exports = fallbackAuth;
