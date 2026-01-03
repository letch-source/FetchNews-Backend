/**
 * Automatic Summary Fetch Job
 * 
 * Runs at 6AM and 6PM daily to generate summaries for all users
 * based on their selected topics (customTopics).
 */

const cron = require('node-cron');
const User = require('../models/User');
const { fetchMultipleTopicsFromCache } = require('../services/cachedArticleFetcher');
const { generateSummaryWithAudio } = require('../services/summaryGenerator');

let isJobRunning = false;
let lastRunTime = null;
let lastRunStats = { success: 0, failed: 0, total: 0 };

/**
 * Generate summaries for a single user from cached articles
 */
async function generateUserSummaries(user) {
  try {
    // Skip users with no custom topics
    if (!user.customTopics || user.customTopics.length === 0) {
      console.log(`⏭️  Skipping user ${user.email} - no custom topics`);
      return { success: false, reason: 'no_topics' };
    }

    console.log(`📰 Generating summaries for ${user.email} - ${user.customTopics.length} topics`);

    // Get user preferences
    const wordCount = user.length || 200;
    const country = user.selectedCountry || 'us';

    // Fetch articles from cache for all user's topics
    const results = await fetchMultipleTopicsFromCache({
      topics: user.customTopics,
      country,
      wordCount,
      goodNewsOnly: false
    });

    if (!results || !results.topicSections || results.topicSections.length === 0) {
      console.log(`⚠️  No articles found for ${user.email}`);
      return { success: false, reason: 'no_articles' };
    }

    // Get time-based title
    const hour = new Date().getHours();
    let timeOfDay = 'Morning';
    if (hour >= 12 && hour < 17) timeOfDay = 'Afternoon';
    else if (hour >= 17 || hour < 5) timeOfDay = 'Evening';
    
    const title = `${timeOfDay} Fetch`;

    // Add to user's history
    await user.addSummaryToHistory({
      title,
      summary: `Your ${timeOfDay.toLowerCase()} news update covering ${results.topicSections.length} topics.`,
      audioUrl: null, // No combined audio
      topicSections: results.topicSections,
      sources: []
    });

    console.log(`✅ Generated summaries for ${user.email} - ${results.topicSections.length} topics`);
    return { success: true, topicCount: results.topicSections.length };

  } catch (error) {
    console.error(`❌ Error generating summaries for ${user.email}:`, error.message);
    return { success: false, reason: 'error', error: error.message };
  }
}

/**
 * Main job function - runs for all users
 */
async function runAutoFetchJob() {
  if (isJobRunning) {
    console.log('⏸️  Auto-fetch job already running, skipping...');
    return;
  }

  isJobRunning = true;
  const startTime = Date.now();
  console.log('🚀 Starting automatic fetch job at', new Date().toISOString());

  try {
    // Get all users with custom topics
    const users = await User.find({
      customTopics: { $exists: true, $not: { $size: 0 } }
    });

    console.log(`👥 Found ${users.length} users with custom topics`);

    lastRunStats = { success: 0, failed: 0, total: users.length };

    // Process users in parallel (batches of 5 to avoid overload)
    const batchSize = 5;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(user => generateUserSummaries(user))
      );

      // Count successes and failures
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value.success) {
          lastRunStats.success++;
        } else {
          lastRunStats.failed++;
          const user = batch[idx];
          console.log(`⚠️  Failed for ${user.email}:`, result.reason || result.value?.reason);
        }
      });

      // Small delay between batches
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Auto-fetch job completed in ${duration}s`);
    console.log(`   Success: ${lastRunStats.success}, Failed: ${lastRunStats.failed}, Total: ${lastRunStats.total}`);

  } catch (error) {
    console.error('❌ Auto-fetch job failed:', error);
  } finally {
    isJobRunning = false;
    lastRunTime = new Date();
  }
}

/**
 * Initialize the cron jobs
 */
function initializeAutoFetch() {
  console.log('⏰ Initializing automatic fetch cron jobs...');

  // Run at 6:00 AM every day
  cron.schedule('0 6 * * *', () => {
    console.log('🌅 6AM auto-fetch triggered');
    runAutoFetchJob();
  }, {
    timezone: "America/Los_Angeles" // PST/PDT
  });

  // Run at 6:00 PM every day
  cron.schedule('0 18 * * *', () => {
    console.log('🌆 6PM auto-fetch triggered');
    runAutoFetchJob();
  }, {
    timezone: "America/Los_Angeles" // PST/PDT
  });

  console.log('✅ Auto-fetch cron jobs scheduled (6AM & 6PM PST)');
}

/**
 * Get job status
 */
function getJobStatus() {
  return {
    isRunning: isJobRunning,
    lastRun: lastRunTime,
    lastRunStats
  };
}

/**
 * Manual trigger (for testing)
 */
async function triggerManualFetch() {
  if (isJobRunning) {
    throw new Error('Job is already running');
  }
  await runAutoFetchJob();
  return getJobStatus();
}

module.exports = {
  initializeAutoFetch,
  getJobStatus,
  triggerManualFetch
};
