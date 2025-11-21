// Fallback authentication when database is not available
// This is a temporary solution for development/testing

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';

// File path for persistent user storage
const USERS_FILE = path.join(__dirname, '../server_data', 'fallback_users.json');

// Ensure server_data directory exists
const serverDataDir = path.dirname(USERS_FILE);
if (!fs.existsSync(serverDataDir)) {
  fs.mkdirSync(serverDataDir, { recursive: true });
  console.log(`[FALLBACK AUTH] Created server_data directory at ${serverDataDir}`);
}
console.log(`[FALLBACK AUTH] Using users file: ${USERS_FILE}`);
console.log(`[FALLBACK AUTH] File exists: ${fs.existsSync(USERS_FILE)}`);

// Simple in-memory user store (loaded from disk on startup)
const fallbackUsers = new Map();

// Helper function to serialize dates for JSON
function serializeUser(user) {
  const serialized = { ...user };
  // Convert Date objects to ISO strings
  if (serialized.createdAt instanceof Date) {
    serialized.createdAt = serialized.createdAt.toISOString();
  }
  if (serialized.updatedAt instanceof Date) {
    serialized.updatedAt = serialized.updatedAt.toISOString();
  }
  if (serialized.lastUsageDate instanceof Date) {
    serialized.lastUsageDate = serialized.lastUsageDate.toISOString();
  }
  if (serialized.subscriptionExpiresAt instanceof Date) {
    serialized.subscriptionExpiresAt = serialized.subscriptionExpiresAt.toISOString();
  }
  // Handle summaryHistory timestamps
  if (serialized.summaryHistory && Array.isArray(serialized.summaryHistory)) {
    serialized.summaryHistory = serialized.summaryHistory.map(entry => ({
      ...entry,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp
    }));
  }
  return serialized;
}

// Helper function to deserialize dates from JSON
function deserializeUser(userData) {
  const user = { ...userData };
  // Convert ISO strings back to Date objects
  if (user.createdAt) {
    user.createdAt = new Date(user.createdAt);
  }
  if (user.updatedAt) {
    user.updatedAt = new Date(user.updatedAt);
  }
  if (user.lastUsageDate) {
    user.lastUsageDate = new Date(user.lastUsageDate);
  }
  if (user.subscriptionExpiresAt) {
    user.subscriptionExpiresAt = new Date(user.subscriptionExpiresAt);
  }
  // Handle summaryHistory timestamps
  if (user.summaryHistory && Array.isArray(user.summaryHistory)) {
    user.summaryHistory = user.summaryHistory.map(entry => ({
      ...entry,
      timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date()
    }));
  }
  // Ensure selectedTopics is always an array (for users created before this field existed)
  if (!user.selectedTopics || !Array.isArray(user.selectedTopics)) {
    user.selectedTopics = [];
  }
  // Ensure other array fields are arrays
  if (!user.customTopics || !Array.isArray(user.customTopics)) {
    user.customTopics = [];
  }
  if (!user.lastFetchedTopics || !Array.isArray(user.lastFetchedTopics)) {
    user.lastFetchedTopics = [];
  }
  if (!user.selectedNewsSources || !Array.isArray(user.selectedNewsSources)) {
    user.selectedNewsSources = [];
  }
  if (!user.scheduledSummaries || !Array.isArray(user.scheduledSummaries)) {
    user.scheduledSummaries = [];
  }
  return user;
}

// Load users from disk on startup
function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const usersArray = JSON.parse(data);
      fallbackUsers.clear();
      usersArray.forEach(userData => {
        const user = deserializeUser(userData);
        fallbackUsers.set(user.email, user);
        console.log(`[FALLBACK AUTH] Loaded user ${user.email} - selectedTopics: ${JSON.stringify(user.selectedTopics || [])} (${(user.selectedTopics || []).length} topics)`);
      });
      console.log(`[FALLBACK AUTH] Loaded ${fallbackUsers.size} users from ${USERS_FILE}`);
    } catch (error) {
      console.error(`[FALLBACK AUTH] Failed to load users from ${USERS_FILE}:`, error);
      fallbackUsers.clear();
    }
  } else {
    console.log(`[FALLBACK AUTH] No existing users file found at ${USERS_FILE}, starting with empty store`);
  }
}

// Save users to disk
function saveUsers() {
  try {
    const usersArray = Array.from(fallbackUsers.values()).map(user => serializeUser(user));
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersArray, null, 2));
    console.log(`[FALLBACK AUTH] Saved ${fallbackUsers.size} users to ${USERS_FILE}`);
    // Log selectedTopics for each user being saved
    usersArray.forEach(userData => {
      const selectedTopics = userData.selectedTopics || [];
      console.log(`[FALLBACK AUTH] Saved user ${userData.email} - selectedTopics: ${JSON.stringify(selectedTopics)} (${selectedTopics.length} topics)`);
    });
  } catch (error) {
    console.error(`[FALLBACK AUTH] Failed to save users to ${USERS_FILE}:`, error);
  }
}

// Load users on module initialization
loadUsers();

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

// Fallback authentication functions - Google-only
const fallbackAuth = {
  async findUserByGoogleId(googleId) {
    // Find user by googleId in fallback store
    for (const user of fallbackUsers.values()) {
      if (user.googleId === googleId) {
        console.log(`[FALLBACK AUTH] Found user ${user.email} by Google ID - selectedTopics: ${JSON.stringify(user.selectedTopics || [])} (${(user.selectedTopics || []).length} topics)`);
        return user;
      }
    }
    return null;
  },
  
  async findUserByEmail(email) {
    // Only return if user has googleId (Google-authenticated)
    const user = fallbackUsers.get(email);
    if (user && user.googleId) {
      return user;
    }
    return null;
  },
  
  async findUserById(id) {
    // Find user by id, but only if they have googleId
    for (const user of fallbackUsers.values()) {
      if (user._id === id && user.googleId) {
        console.log(`[FALLBACK AUTH] Found user ${user.email} by ID - selectedTopics: ${JSON.stringify(user.selectedTopics || [])} (${(user.selectedTopics || []).length} topics)`);
        return user;
      }
    }
    return null;
  },
  
  async createGoogleUser(email, googleId, name = null) {
    const user = {
      _id: `fallback-${Date.now()}`,
      email,
      googleId: googleId,
      name: name || null,
      isPremium: false,
      dailyUsageCount: 0,
      lastUsageDate: new Date(),
      subscriptionId: null,
      subscriptionExpiresAt: null,
      customTopics: [],
      summaryHistory: [],
      emailVerified: true,
      selectedVoice: 'alloy',
      playbackRate: 1.0,
      upliftingNewsOnly: false,
      lastFetchedTopics: [],
      selectedTopics: [],
      selectedNewsSources: [],
      scheduledSummaries: [],
      preferences: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    fallbackUsers.set(email, user);
    saveUsers(); // Persist to disk
    return user;
  },
  
  // Deprecated - kept for backwards compatibility but should not be used
  async createUser(email, password) {
    throw new Error('Password-based authentication is no longer supported. Please use Google Sign-In.');
  },
  
  async comparePassword(user, candidatePassword) {
    return bcrypt.compare(candidatePassword, user.password);
  },
  
  async updateSubscription(user, isPremium, subscriptionId = null, expiresAt = null) {
    user.isPremium = isPremium;
    user.subscriptionId = subscriptionId;
    user.subscriptionExpiresAt = expiresAt;
    user.updatedAt = new Date();
    saveUsers(); // Persist to disk
    return user;
  },

  // Custom topics management for fallback
  async addCustomTopic(user, topic) {
    if (!user.customTopics.includes(topic)) {
      user.customTopics.push(topic);
      user.updatedAt = new Date();
      saveUsers(); // Persist to disk
    }
    return user.customTopics;
  },

  async removeCustomTopic(user, topic) {
    user.customTopics = user.customTopics.filter(t => t !== topic);
    user.updatedAt = new Date();
    saveUsers(); // Persist to disk
    return user.customTopics;
  },

  async updateCustomTopics(user, customTopics) {
    user.customTopics = customTopics;
    user.updatedAt = new Date();
    saveUsers(); // Persist to disk
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
    
    user.updatedAt = new Date();
    saveUsers(); // Persist to disk
    return user.summaryHistory;
  },

  getSummaryHistory(user) {
    return user.summaryHistory || [];
  },

  async clearSummaryHistory(user) {
    user.summaryHistory = [];
    user.updatedAt = new Date();
    saveUsers(); // Persist to disk
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
    user.updatedAt = new Date();
    saveUsers(); // Persist to disk
    return user;
  },
  
  async saveUser(user) {
    // Ensure the user is in the Map
    if (!fallbackUsers.has(user.email)) {
      fallbackUsers.set(user.email, user);
    }
    user.updatedAt = new Date();
    saveUsers(); // Persist to disk
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
    console.log(`[FALLBACK AUTH] updatePreferences called for ${user.email}`);
    console.log(`[FALLBACK AUTH] Current selectedTopics: ${JSON.stringify(user.selectedTopics || [])}`);
    console.log(`[FALLBACK AUTH] New selectedTopics: ${JSON.stringify(preferences.selectedTopics)}`);
    
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
      console.log(`[FALLBACK AUTH] Updated selectedTopics to: ${JSON.stringify(user.selectedTopics)}`);
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
    
    user.updatedAt = new Date();
    
    // Ensure the user is still in the Map (in case it was removed somehow)
    if (!fallbackUsers.has(user.email)) {
      console.log(`[FALLBACK AUTH] WARNING: User ${user.email} not in Map, re-adding before save`);
      fallbackUsers.set(user.email, user);
    }
    
    saveUsers(); // Persist to disk
    console.log(`[FALLBACK AUTH] After save - user.selectedTopics: ${JSON.stringify(user.selectedTopics || [])}`);
    return this.getPreferences(user);
  }
};

module.exports = fallbackAuth;
