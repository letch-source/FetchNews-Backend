const mongoose = require('mongoose');

const globalSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'trending_topics'
  },
  trendingTopics: {
    type: [String],
    default: []
  },
  trendingTopicsWithSources: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  lastTrendingUpdate: {
    type: Date,
    default: null
  },
  globalNewsSources: {
    type: [String],
    default: []
  },
  globalNewsSourcesEnabled: {
    type: Boolean,
    default: false
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one document exists (singleton pattern)
globalSettingsSchema.statics.getOrCreate = async function() {
  let settings = await this.findOne({ key: 'trending_topics' });
  if (!settings) {
    settings = await this.create({ key: 'trending_topics' });
  }
  return settings;
};

// Update trending topics
globalSettingsSchema.methods.updateTrendingTopics = async function(topics, topicsWithSources = {}) {
  this.trendingTopics = topics;
  this.trendingTopicsWithSources = topicsWithSources;
  this.lastTrendingUpdate = new Date();
  await this.save();
  return this;
};

// Update global news sources
globalSettingsSchema.methods.updateGlobalNewsSources = async function(sources, enabled = true) {
  this.globalNewsSources = sources || [];
  this.globalNewsSourcesEnabled = enabled;
  await this.save();
  return this;
};

const GlobalSettings = mongoose.models.GlobalSettings || mongoose.model('GlobalSettings', globalSettingsSchema);

module.exports = GlobalSettings;

