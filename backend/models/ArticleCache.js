const mongoose = require('mongoose');

const ArticleCacheSchema = new mongoose.Schema({
  // Original NewsAPI article data
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  url: {
    type: String,
    required: true,
    unique: true // Prevent duplicate articles
  },
  publishedAt: {
    type: Date,
    required: true,
    index: true // Index for sorting by date
  },
  source: {
    id: String,
    name: String
  },
  urlToImage: {
    type: String,
    default: ''
  },
  author: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    default: ''
  },
  
  // AI-generated categories
  categories: {
    type: [String],
    default: [],
    index: true // Index for querying by category
  },
  
  // Metadata
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  categorizedAt: {
    type: Date
  },
  categorizationModel: {
    type: String,
    default: 'gpt-4o-mini'
  },
  
  // TTL - auto-delete after 7 days
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    index: { expires: 0 }
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
ArticleCacheSchema.index({ categories: 1, publishedAt: -1 });
ArticleCacheSchema.index({ 'source.id': 1, publishedAt: -1 });
ArticleCacheSchema.index({ expiresAt: 1, publishedAt: -1 });

// Static method to get articles by category
ArticleCacheSchema.statics.getByCategory = function(category, limit = 50) {
  return this.find({
    categories: category,
    expiresAt: { $gt: new Date() }
  })
  .sort({ publishedAt: -1 })
  .limit(limit);
};

// Static method to get articles by multiple categories (OR query)
ArticleCacheSchema.statics.getByCategoriesOr = function(categories, limit = 50) {
  return this.find({
    categories: { $in: categories },
    expiresAt: { $gt: new Date() }
  })
  .sort({ publishedAt: -1 })
  .limit(limit);
};

// Static method to get articles by source
ArticleCacheSchema.statics.getBySource = function(sourceId, limit = 50) {
  return this.find({
    'source.id': sourceId,
    expiresAt: { $gt: new Date() }
  })
  .sort({ publishedAt: -1 })
  .limit(limit);
};

// Static method to get cache statistics
ArticleCacheSchema.statics.getStats = async function() {
  const total = await this.countDocuments({ expiresAt: { $gt: new Date() } });
  
  const byCategory = await this.aggregate([
    { $match: { expiresAt: { $gt: new Date() } } },
    { $unwind: '$categories' },
    { $group: { _id: '$categories', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  
  const bySource = await this.aggregate([
    { $match: { expiresAt: { $gt: new Date() } } },
    { $group: { _id: '$source.id', name: { $first: '$source.name' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  
  const oldest = await this.findOne({ expiresAt: { $gt: new Date() } }).sort({ publishedAt: 1 });
  const newest = await this.findOne({ expiresAt: { $gt: new Date() } }).sort({ publishedAt: -1 });
  
  return {
    total,
    byCategory,
    bySource,
    oldestArticle: oldest?.publishedAt,
    newestArticle: newest?.publishedAt,
    lastUpdated: newest?.categorizedAt
  };
};

module.exports = mongoose.model('ArticleCache', ArticleCacheSchema);
