/**
 * Topic Summary Cache Model
 * Stores pre-generated summaries per topic that can be reused across all users
 * 
 * This enables efficient caching where summaries are generated once per topic
 * and shared across all users, rather than generated per user.
 */

const mongoose = require('mongoose');

const topicSummaryCacheSchema = new mongoose.Schema({
  // Normalized topic name (slugified for consistency)
  topic: {
    type: String,
    required: true,
    index: true
  },
  
  // The AI-generated summary text
  summary: {
    type: String,
    required: true
  },
  
  // Target word count for this summary
  wordCount: {
    type: Number,
    default: 200
  },
  
  // Country/location context (optional, for location-specific topics like "local")
  country: {
    type: String,
    default: 'us'
  },
  
  // Metadata about the summary
  metadata: {
    enhancedTags: [String],
    sentiment: String,
    keyEntities: [String],
    importance: String
  },
  
  // Articles used to generate this summary
  sourceArticles: [{
    title: String,
    url: String,
    source: String,
    publishedAt: Date
  }],
  
  // Quality metrics
  articleCount: {
    type: Number,
    default: 0
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Expiration - summaries expire after 12 hours to stay fresh
  expiresAt: {
    type: Date,
    required: true,
    index: true
  }
});

// Compound index for efficient lookups
topicSummaryCacheSchema.index({ topic: 1, wordCount: 1, country: 1, expiresAt: 1 });

// TTL index - MongoDB will auto-delete expired documents
topicSummaryCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Get or create a summary for a topic
 * @param {string} topic - Topic name
 * @param {number} wordCount - Target word count
 * @param {string} country - Country code
 * @returns {Object|null} Cached summary or null if not found/expired
 */
topicSummaryCacheSchema.statics.getCachedSummary = async function(topic, wordCount = 200, country = 'us') {
  const normalizedTopic = topic.toLowerCase().trim();
  
  const cached = await this.findOne({
    topic: normalizedTopic,
    wordCount: { $gte: wordCount * 0.8, $lte: wordCount * 1.2 }, // Allow 20% variance
    country,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });
  
  if (cached) {
    console.log(`✅ [TOPIC CACHE HIT] Found cached summary for "${topic}"`);
  } else {
    console.log(`❌ [TOPIC CACHE MISS] No cached summary for "${topic}"`);
  }
  
  return cached;
};

/**
 * Store a new summary for a topic
 * @param {string} topic - Topic name
 * @param {string} summary - Summary text
 * @param {number} wordCount - Target word count
 * @param {string} country - Country code
 * @param {Object} metadata - Summary metadata
 * @param {Array} sourceArticles - Articles used
 * @returns {Object} Created cache entry
 */
topicSummaryCacheSchema.statics.cacheSummary = async function(topic, summary, wordCount, country, metadata, sourceArticles) {
  const normalizedTopic = topic.toLowerCase().trim();
  
  // Calculate expiration (12 hours from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 12);
  
  const cacheEntry = await this.create({
    topic: normalizedTopic,
    summary,
    wordCount,
    country,
    metadata: metadata || {},
    sourceArticles: (sourceArticles || []).map(a => ({
      title: a.title,
      url: a.url,
      source: typeof a.source === 'object' ? (a.source?.name || a.source?.id || '') : a.source,
      publishedAt: a.publishedAt
    })),
    articleCount: sourceArticles?.length || 0,
    expiresAt
  });
  
  console.log(`💾 [TOPIC CACHE SAVE] Cached summary for "${topic}" (expires: ${expiresAt.toISOString()})`);
  
  return cacheEntry;
};

/**
 * Get cache statistics
 */
topicSummaryCacheSchema.statics.getStats = async function() {
  const total = await this.countDocuments({ expiresAt: { $gt: new Date() } });
  const byTopic = await this.aggregate([
    { $match: { expiresAt: { $gt: new Date() } } },
    { $group: { _id: '$topic', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  
  const oldest = await this.findOne({ expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 });
  const newest = await this.findOne({ expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  
  return {
    total,
    byTopic: byTopic.map(t => ({ topic: t._id, count: t.count })),
    oldestSummary: oldest?.createdAt || null,
    newestSummary: newest?.createdAt || null
  };
};

/**
 * Clear all expired summaries manually (for testing)
 */
topicSummaryCacheSchema.statics.clearExpired = async function() {
  const result = await this.deleteMany({ expiresAt: { $lt: new Date() } });
  console.log(`🗑️ Cleared ${result.deletedCount} expired topic summaries`);
  return result.deletedCount;
};

module.exports = mongoose.model('TopicSummaryCache', topicSummaryCacheSchema);
