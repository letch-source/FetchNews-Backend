/**
 * Article Categorization Job
 * Fetches articles from NewsAPI and categorizes them with ChatGPT
 * Runs on a schedule (default: 6am and 6pm daily)
 */

const cron = require('node-cron');
const ArticleCache = require('../models/ArticleCache');
const User = require('../models/User');
const { fetchAllArticles, normalizeArticle } = require('../services/articleFetcher');
const { categorizeAllArticles, validateCategories } = require('../services/articleCategorizer');

let isRunning = false;
let lastRunTime = null;
let lastRunStats = null;

/**
 * Main categorization job
 */
async function runCategorizationJob() {
  if (isRunning) {
    console.log('[CATEGORIZATION JOB] Already running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  
  console.log('\n' + '='.repeat(80));
  console.log('🔄 STARTING ARTICLE CATEGORIZATION JOB');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);
  
  const stats = {
    startTime: new Date(),
    articlesFetched: 0,
    articlesProcessed: 0,
    articlesSaved: 0,
    articlesUpdated: 0,
    articlesFailed: 0,
    duration: 0,
    error: null
  };

  try {
    // Step 1: Fetch articles from NewsAPI
    console.log('\n📡 Step 1: Fetching articles from NewsAPI...');
    const rawArticles = await fetchAllArticles();
    stats.articlesFetched = rawArticles.length;
    
    if (rawArticles.length === 0) {
      console.warn('⚠️  No articles fetched from NewsAPI');
      stats.error = 'No articles fetched';
      return stats;
    }
    
    console.log(`✅ Fetched ${rawArticles.length} articles`);

    // Step 2: Filter out articles already in cache (by URL)
    console.log('\n🔍 Step 2: Checking for existing articles in cache...');
    const existingUrls = new Set(
      (await ArticleCache.find({
        url: { $in: rawArticles.map(a => a.url) }
      }).select('url')).map(doc => doc.url)
    );
    
    const newArticles = rawArticles.filter(a => !existingUrls.has(a.url));
    console.log(`✅ Found ${existingUrls.size} existing, ${newArticles.length} new articles`);

    if (newArticles.length === 0) {
      console.log('✅ No new articles to process');
      stats.articlesProcessed = 0;
      return stats;
    }

    // Step 3: Fetch all user custom topics
    console.log('\n👥 Step 3: Fetching user custom topics...');
    const allUsers = await User.find({}).select('customTopics');
    const customTopicsSet = new Set();
    allUsers.forEach(user => {
      if (user.customTopics && Array.isArray(user.customTopics)) {
        user.customTopics.forEach(topic => {
          if (topic && typeof topic === 'string') {
            customTopicsSet.add(topic.trim());
          }
        });
      }
    });
    const customTopics = Array.from(customTopicsSet);
    console.log(`✅ Found ${customTopics.length} unique custom topics from ${allUsers.length} users`);
    if (customTopics.length > 0) {
      console.log(`   Sample topics: ${customTopics.slice(0, 10).join(', ')}${customTopics.length > 10 ? '...' : ''}`);
    }

    // Step 4: Categorize articles with ChatGPT
    console.log(`\n🤖 Step 4: Categorizing ${newArticles.length} articles with ChatGPT...`);
    const categorizedResults = await categorizeAllArticles(newArticles, customTopics, 100, 'gpt-4o-mini');
    stats.articlesProcessed = categorizedResults.length;
    
    // Step 5: Save to cache
    console.log('\n💾 Step 5: Saving categorized articles to cache...');
    const articlesToSave = categorizedResults.map(result => {
      const normalized = normalizeArticle(result.article);
      return {
        ...normalized,
        categories: validateCategories(result.categories),
        categorizedAt: new Date(),
        categorizationModel: 'gpt-4o-mini',
        fetchedAt: new Date()
      };
    });

    // Bulk insert with ordered: false to continue on duplicate errors
    try {
      const insertResult = await ArticleCache.insertMany(articlesToSave, { 
        ordered: false,
        rawResult: true 
      });
      stats.articlesSaved = insertResult.insertedCount || articlesToSave.length;
      console.log(`✅ Saved ${stats.articlesSaved} articles to cache`);
    } catch (error) {
      // Handle duplicate key errors (articles that were added between check and insert)
      if (error.code === 11000) {
        const inserted = error.result?.nInserted || 0;
        stats.articlesSaved = inserted;
        stats.articlesFailed = articlesToSave.length - inserted;
        console.log(`⚠️  Saved ${inserted} articles, ${stats.articlesFailed} duplicates skipped`);
      } else {
        throw error;
      }
    }

    // Step 6: Get final statistics
    const cacheStats = await ArticleCache.getStats();
    
    stats.duration = Date.now() - startTime;
    lastRunTime = new Date();
    lastRunStats = stats;

    console.log('\n' + '='.repeat(80));
    console.log('✅ CATEGORIZATION JOB COMPLETE');
    console.log('='.repeat(80));
    console.log(`Duration: ${(stats.duration / 1000).toFixed(2)}s`);
    console.log(`Articles fetched: ${stats.articlesFetched}`);
    console.log(`New articles processed: ${stats.articlesProcessed}`);
    console.log(`Articles saved: ${stats.articlesSaved}`);
    console.log(`\nCache Statistics:`);
    console.log(`  Total articles in cache: ${cacheStats.total}`);
    console.log(`  Oldest article: ${cacheStats.oldestArticle?.toISOString()}`);
    console.log(`  Newest article: ${cacheStats.newestArticle?.toISOString()}`);
    console.log(`  Categories:`, cacheStats.byCategory);
    console.log('='.repeat(80) + '\n');

    return stats;
  } catch (error) {
    console.error('\n❌ CATEGORIZATION JOB FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    stats.error = error.message;
    stats.duration = Date.now() - startTime;
    lastRunStats = stats;
    
    throw error;
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule categorization job
 * Default: Run at 6am and 6pm daily
 */
function scheduleCategorization(schedule = '0 6,18 * * *') {
  console.log(`\n📅 Scheduling article categorization job: ${schedule}`);
  console.log('   Schedule: 6am and 6pm daily (America/New_York timezone)');
  
  cron.schedule(schedule, async () => {
    console.log('\n⏰ Scheduled categorization job triggered');
    try {
      await runCategorizationJob();
    } catch (error) {
      console.error('❌ Scheduled job failed:', error.message);
    }
  }, {
    timezone: 'America/New_York'
  });
  
  console.log('✅ Categorization job scheduled successfully\n');
}

/**
 * Get job status
 */
function getJobStatus() {
  return {
    isRunning,
    lastRunTime,
    lastRunStats,
    nextRun: lastRunTime 
      ? new Date(lastRunTime.getTime() + 12 * 60 * 60 * 1000) // Next run in 12 hours
      : null
  };
}

module.exports = {
  runCategorizationJob,
  scheduleCategorization,
  getJobStatus
};
