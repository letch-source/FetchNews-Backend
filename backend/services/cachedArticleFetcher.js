/**
 * Cached Article Fetcher Service
 * Fetches articles from ArticleCache instead of NewsAPI
 * This reduces NewsAPI calls from hundreds per day to just 2 (scheduled job runs)
 */

const ArticleCache = require('../models/ArticleCache');
const { slugify } = require('./articleCategorizer');

/**
 * Fetch articles from cache by topic/category
 * @param {string} topic - Topic name (e.g., "technology", "artificial intelligence")
 * @param {object} geoData - Optional geo data (not used currently, but kept for API compatibility)
 * @param {number} limit - Max number of articles to return
 * @param {array} excludedSources - Sources to exclude
 * @returns {object} { articles: [...] }
 */
async function fetchArticlesFromCache(topic, geoData = null, limit = 20, excludedSources = []) {
  try {
    console.log(`[CACHE FETCH] Fetching articles for topic: "${topic}" (limit: ${limit})`);
    
    // Normalize topic to match stored categories (slugified)
    const normalizedTopic = slugify(topic);
    
    // Build query
    const query = {
      categories: normalizedTopic,
      expiresAt: { $gt: new Date() }
    };
    
    // Add source exclusion if specified
    if (excludedSources && excludedSources.length > 0) {
      const excludedSet = new Set(excludedSources.map(s => s.toLowerCase()));
      query.$or = [
        { 'source.id': { $nin: Array.from(excludedSet) } },
        { 'source.name': { $nin: Array.from(excludedSet) } }
      ];
    }
    
    // Fetch from cache, sorted by most recent first
    const cachedArticles = await ArticleCache.find(query)
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean(); // Use lean() for better performance
    
    console.log(`[CACHE FETCH] Found ${cachedArticles.length} cached articles for "${normalizedTopic}"`);
    
    // Transform to NewsAPI format for compatibility with existing code
    const articles = cachedArticles.map(article => ({
      title: article.title,
      description: article.description,
      url: article.url,
      urlToImage: article.urlToImage,
      publishedAt: article.publishedAt.toISOString(),
      source: {
        id: article.source?.id || null,
        name: article.source?.name || 'Unknown'
      },
      author: article.author,
      content: article.content
    }));
    
    if (articles.length === 0) {
      console.warn(`[CACHE FETCH] No cached articles found for topic "${topic}" (normalized: "${normalizedTopic}")`);
      console.warn(`[CACHE FETCH] Consider checking if articles are being fetched and categorized correctly`);
    }
    
    return { articles };
  } catch (error) {
    console.error(`[CACHE FETCH] Error fetching from cache for topic "${topic}":`, error.message);
    throw error;
  }
}

/**
 * Fetch articles from cache for multiple topics (OR query)
 * More efficient than making separate queries for each topic
 * @param {array} topics - Array of topic names
 * @param {object} geoData - Optional geo data
 * @param {number} limitPerTopic - Max articles per topic
 * @param {array} excludedSources - Sources to exclude
 * @returns {object} { [topic]: { articles: [...] } }
 */
async function fetchMultipleTopicsFromCache(topics, geoData = null, limitPerTopic = 20, excludedSources = []) {
  try {
    console.log(`[CACHE FETCH] Fetching articles for ${topics.length} topics...`);
    
    // Normalize all topics
    const normalizedTopics = topics.map(slugify);
    
    // Build query for all topics at once
    const query = {
      categories: { $in: normalizedTopics },
      expiresAt: { $gt: new Date() }
    };
    
    // Add source exclusion
    if (excludedSources && excludedSources.length > 0) {
      const excludedSet = new Set(excludedSources.map(s => s.toLowerCase()));
      query.$or = [
        { 'source.id': { $nin: Array.from(excludedSet) } },
        { 'source.name': { $nin: Array.from(excludedSet) } }
      ];
    }
    
    // Fetch all articles that match any topic
    const cachedArticles = await ArticleCache.find(query)
      .sort({ publishedAt: -1 })
      .limit(limitPerTopic * topics.length) // Get enough for all topics
      .lean();
    
    console.log(`[CACHE FETCH] Found ${cachedArticles.length} cached articles across all topics`);
    
    // Group articles by topic
    const results = {};
    topics.forEach((topic, index) => {
      const normalized = normalizedTopics[index];
      
      // Filter articles that have this specific topic
      const topicArticles = cachedArticles
        .filter(article => article.categories.includes(normalized))
        .slice(0, limitPerTopic) // Limit per topic
        .map(article => ({
          title: article.title,
          description: article.description,
          url: article.url,
          urlToImage: article.urlToImage,
          publishedAt: article.publishedAt.toISOString(),
          source: {
            id: article.source?.id || null,
            name: article.source?.name || 'Unknown'
          },
          author: article.author,
          content: article.content
        }));
      
      results[topic] = { articles: topicArticles };
      console.log(`[CACHE FETCH]   "${topic}" -> ${topicArticles.length} articles`);
    });
    
    return results;
  } catch (error) {
    console.error(`[CACHE FETCH] Error fetching multiple topics:`, error.message);
    throw error;
  }
}

/**
 * Check cache health and statistics
 */
async function getCacheHealth() {
  try {
    const stats = await ArticleCache.getStats();
    const now = new Date();
    const ageInHours = stats.newestArticle 
      ? (now - new Date(stats.newestArticle)) / (1000 * 60 * 60)
      : null;
    
    return {
      healthy: stats.total > 0 && ageInHours < 24, // Cache is healthy if it has articles < 24h old
      total: stats.total,
      newestArticleAge: ageInHours ? `${ageInHours.toFixed(1)} hours ago` : 'N/A',
      categories: stats.byCategory.length,
      sources: stats.bySource.length,
      message: stats.total === 0 
        ? 'Cache is empty - categorization job may not be running'
        : ageInHours > 24
        ? 'Cache is stale - categorization job may have failed'
        : 'Cache is healthy'
    };
  } catch (error) {
    console.error('[CACHE HEALTH] Error:', error.message);
    return {
      healthy: false,
      message: `Error checking cache: ${error.message}`
    };
  }
}

module.exports = {
  fetchArticlesFromCache,
  fetchMultipleTopicsFromCache,
  getCacheHealth
};

