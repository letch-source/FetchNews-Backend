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
  excludedNewsSources: {
    type: [String],
    default: []
  },
  excludedNewsSourcesEnabled: {
    type: Boolean,
    default: false
  },
  // Legacy field for migration (deprecated)
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

// Update excluded news sources (blocklist approach)
globalSettingsSchema.methods.updateExcludedNewsSources = async function(sources, enabled = true) {
  this.excludedNewsSources = sources || [];
  this.excludedNewsSourcesEnabled = enabled;
  await this.save();
  return this;
};

// Legacy method for migration (deprecated)
globalSettingsSchema.methods.updateGlobalNewsSources = async function(sources, enabled = true) {
  // Migrate old allowlist to new blocklist: if old system had sources, exclude everything else
  // For now, just disable it and use excluded sources instead
  this.globalNewsSources = [];
  this.globalNewsSourcesEnabled = false;
  this.excludedNewsSources = sources || [];
  this.excludedNewsSourcesEnabled = enabled;
  await this.save();
  return this;
};

const GlobalSettings = mongoose.models.GlobalSettings || mongoose.model('GlobalSettings', globalSettingsSchema);

module.exports = GlobalSettings;

