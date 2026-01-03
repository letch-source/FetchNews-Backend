const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { fetchArticlesFromCache, getCacheHealth } = require('../services/cachedArticleFetcher');
const { summarizeArticles, combineTopicSummaries, addIntroAndOutro, filterRelevantArticles, isUpliftingNews } = require('../index');

const router = express.Router();

// Optional: Require admin access for production safety
// Uncomment this middleware and add it to routes below for admin-only access
/*
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
*/

/**
 * Manual test endpoint to fetch from cached articles
 * POST /api/test-fetch
 * 
 * For production: Add authenticateToken middleware for security
 * 
 * Body:
 * {
 *   topics: ['technology', 'sports'],        // Required: array of topics
 *   customTopics: ['AI Ethics'],             // Optional: custom topics
 *   wordCount: 200,                          // Optional: summary length (default: 200)
 *   goodNewsOnly: false,                     // Optional: filter uplifting news (default: false)
 *   selectedVoice: 'alloy',                  // Optional: TTS voice (default: 'alloy')
 *   skipAuth: true                           // Optional: skip authentication for testing
 * }
 */
// For production safety, add authenticateToken middleware:
// router.post('/', authenticateToken, async (req, res) => {
// For development/testing without auth:
router.post('/', async (req, res) => {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 MANUAL FETCH TEST INITIATED');
    console.log('='.repeat(80));
    
    const {
      topics = [],
      customTopics = [],
      wordCount = 200,
      goodNewsOnly = false,
      selectedVoice = 'alloy',
      skipAuth = false,
      excludedSources = []
    } = req.body;
    
    // Combine all topics
    const allTopics = [...topics, ...customTopics];
    
    if (allTopics.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'At least one topic is required',
        example: {
          topics: ['technology', 'sports'],
          customTopics: ['AI Ethics'],
          wordCount: 200
        }
      });
    }
    
    console.log(`📋 Test Configuration:`);
    console.log(`   Topics: ${topics.join(', ') || 'none'}`);
    console.log(`   Custom Topics: ${customTopics.join(', ') || 'none'}`);
    console.log(`   Word Count: ${wordCount}`);
    console.log(`   Good News Only: ${goodNewsOnly}`);
    console.log(`   Excluded Sources: ${excludedSources.length > 0 ? excludedSources.join(', ') : 'none'}`);
    console.log('');
    
    // Check cache health first
    console.log('🏥 Checking cache health...');
    const cacheHealth = await getCacheHealth();
    console.log(`   Status: ${cacheHealth.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log(`   Total Articles: ${cacheHealth.total}`);
    console.log(`   Newest Article: ${cacheHealth.newestArticleAge}`);
    console.log(`   Message: ${cacheHealth.message}`);
    console.log('');
    
    if (!cacheHealth.healthy) {
      return res.status(503).json({
        success: false,
        error: 'Cache is not healthy',
        cacheHealth,
        suggestion: 'Run: node backend/scripts/run-categorization-now.js'
      });
    }
    
    // Process each topic
    const results = [];
    const summariesWithTopics = [];
    const allArticles = [];
    
    console.log('🔍 Fetching articles from cache...\n');
    
    for (const topic of allTopics) {
      try {
        console.log(`  📰 Topic: "${topic}"`);
        
        // Determine articles per topic based on word count
        const perTopic = wordCount >= 1500 ? 20 : wordCount >= 800 ? 12 : 6;
        
        // Fetch from cache
        const { articles } = await fetchArticlesFromCache(topic, null, perTopic, excludedSources);
        
        console.log(`     Fetched: ${articles.length} articles from cache`);
        
        if (articles.length === 0) {
          console.log(`     ⚠️  No cached articles found for "${topic}"`);
          results.push({
            topic,
            status: 'no_articles',
            articlesFound: 0,
            summary: null
          });
          continue;
        }
        
        // Filter relevant articles (existing logic)
        let relevant = filterRelevantArticles(topic, null, articles, perTopic);
        console.log(`     Relevant: ${relevant.length} articles after filtering`);
        
        // Apply uplifting news filter if enabled
        if (goodNewsOnly) {
          relevant = relevant.filter(isUpliftingNews);
          console.log(`     Uplifting: ${relevant.length} articles after filtering`);
        }
        
        if (relevant.length === 0) {
          console.log(`     ⚠️  No relevant articles after filtering`);
          results.push({
            topic,
            status: 'no_relevant_articles',
            articlesFound: articles.length,
            summary: null
          });
          continue;
        }
        
        // Generate summary (pass null for user since this is a test)
        console.log(`     🤖 Generating summary...`);
        const summary = await summarizeArticles(topic, null, relevant, wordCount, goodNewsOnly, null);
        console.log(`     ✅ Summary generated (${summary.length} chars)`);
        
        summariesWithTopics.push({ summary, topic });
        
        // Store result
        results.push({
          topic,
          status: 'success',
          articlesFound: articles.length,
          relevantArticles: relevant.length,
          summaryLength: summary.length,
          summary: summary,
          articles: relevant.map(a => ({
            title: a.title,
            source: a.source?.name || a.source,
            url: a.url,
            publishedAt: a.publishedAt
          }))
        });
        
        allArticles.push(...relevant);
        
      } catch (topicError) {
        console.error(`     ❌ Error processing topic "${topic}":`, topicError.message);
        results.push({
          topic,
          status: 'error',
          error: topicError.message
        });
      }
      
      console.log('');
    }
    
    console.log('='.repeat(80));
    console.log('📊 RESULTS SUMMARY');
    console.log('='.repeat(80));
    
    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = results.filter(r => r.status !== 'success').length;
    
    console.log(`\n✅ Successful: ${successCount}/${allTopics.length} topics`);
    console.log(`❌ Failed: ${failCount}/${allTopics.length} topics`);
    console.log(`📄 Total articles fetched: ${allArticles.length}`);
    console.log('');
    
    // Generate combined summary if we have any successful summaries
    let combinedSummary = null;
    if (summariesWithTopics.length > 0) {
      console.log('🔗 Combining summaries...');
      combinedSummary = combineTopicSummaries(summariesWithTopics);
      combinedSummary = addIntroAndOutro(combinedSummary, allTopics, goodNewsOnly, null);
      console.log(`✅ Combined summary generated (${combinedSummary.length} chars)`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🎉 TEST COMPLETE');
    console.log('='.repeat(80) + '\n');
    
    // Return comprehensive results
    res.json({
      success: true,
      summary: {
        totalTopics: allTopics.length,
        successfulTopics: successCount,
        failedTopics: failCount,
        totalArticles: allArticles.length,
        cacheHealth
      },
      combinedSummary,
      topicResults: results,
      metadata: {
        wordCount,
        goodNewsOnly,
        excludedSources,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('\n❌ TEST FETCH ERROR:', error);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/test-fetch/cache-stats
 * Get cache statistics
 * 
 * For production: Add authenticateToken middleware
 */
// For production safety: router.get('/cache-stats', authenticateToken, async (req, res) => {
router.get('/cache-stats', async (req, res) => {
  try {
    const health = await getCacheHealth();
    
    // Get detailed stats if available
    const ArticleCache = require('../models/ArticleCache');
    const stats = await ArticleCache.getStats();
    
    res.json({
      success: true,
      health,
      stats: {
        total: stats.total,
        categories: stats.byCategory?.map(c => ({
          category: c._id,
          count: c.count
        })) || [],
        sources: stats.bySource?.map(s => ({
          id: s._id,
          name: s.name,
          count: s.count
        })) || [],
        dateRange: {
          oldest: stats.oldestArticle,
          newest: stats.newestArticle
        }
      }
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/test-fetch/sample-articles/:topic
 * Get sample articles from cache for a specific topic
 * 
 * For production: Add authenticateToken middleware
 */
// For production safety: router.get('/sample-articles/:topic', authenticateToken, async (req, res) => {
router.get('/sample-articles/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    const { articles } = await fetchArticlesFromCache(topic, null, limit);
    
    res.json({
      success: true,
      topic,
      count: articles.length,
      articles: articles.map(a => ({
        title: a.title,
        description: a.description,
        source: a.source?.name || a.source,
        url: a.url,
        publishedAt: a.publishedAt
      }))
    });
  } catch (error) {
    console.error('Error getting sample articles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
