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
      audioUrl: summaryData.audioUrl,
      sources: summaryData.sources || []
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
    // Helper function to get date string in PST timezone
    const getDateStringInPST = (date = new Date()) => {
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
    };
    
    const today = getDateStringInPST();
    const lastUsageDate = user.lastUsageDate ? getDateStringInPST(new Date(user.lastUsageDate)) : today;
    
    // Reset daily count if it's a new day (resets at midnight PST)
    if (lastUsageDate !== today) {
      user.dailyUsageCount = 0;
      user.lastUsageDate = new Date();
    }
    
    // Premium users have unlimited access
    if (user.isPremium) {
      return { allowed: true, reason: 'premium' };
    }
    
    // Free users limited to 3 fetches per day
    const freeUserLimit = 3;
    if (user.dailyUsageCount >= freeUserLimit) {
      return { allowed: false, reason: 'daily_limit_reached', dailyCount: user.dailyUsageCount, limit: freeUserLimit };
    }
    
    return { allowed: true, reason: 'free_quota', dailyCount: user.dailyUsageCount, limit: freeUserLimit };
  },
  
  async incrementUsage(user) {
    user.dailyUsageCount += 1;
    user.lastUsageDate = new Date();
    return user;
  },
  
  getPreferences(user) {
    return {
      selectedVoice: user.selectedVoice || 'alloy',
      playbackRate: user.playbackRate || 1.0,
      upliftingNewsOnly: user.upliftingNewsOnly || false,
      length: user.preferences?.length || '200',
      lastFetchedTopics: user.lastFetchedTopics || [],
      selectedTopics: user.selectedTopics || [],
      selectedNewsSources: user.selectedNewsSources || [],
      scheduledSummaries: user.scheduledSummaries || []
    };
  },
  
  async updatePreferences(user, preferences) {
    // Update string/number values (only if provided)
    if (preferences.selectedVoice !== undefined) {
      user.selectedVoice = preferences.selectedVoice;
    }
    if (preferences.playbackRate !== undefined) {
      user.playbackRate = preferences.playbackRate;
    }
    
    // Update boolean values (explicitly check for true/false)
    if (preferences.upliftingNewsOnly !== undefined) {
      user.upliftingNewsOnly = preferences.upliftingNewsOnly;
    }
    
    // Update array values (only if provided)
    if (preferences.lastFetchedTopics !== undefined) {
      user.lastFetchedTopics = preferences.lastFetchedTopics;
    }
    if (preferences.selectedTopics !== undefined) {
      user.selectedTopics = preferences.selectedTopics;
    }
    if (preferences.selectedNewsSources !== undefined) {
      user.selectedNewsSources = preferences.selectedNewsSources;
    }
    if (preferences.scheduledSummaries !== undefined) {
      user.scheduledSummaries = preferences.scheduledSummaries;
    }
    
    // Update length in preferences object
    if (!user.preferences) {
      user.preferences = {};
    }
    if (preferences.length !== undefined) {
      user.preferences.length = preferences.length;
    }
    
    return this.getPreferences(user);
  }
};

module.exports = fallbackAuth;
