/**
 * Topic Summary Generation Job
 * 
 * Runs every 6 hours to pre-generate summaries for popular topics
 * This ensures users get instant responses from cache instead of waiting for AI generation
 */

const cron = require('node-cron');
const User = require('../models/User');
const { preGenerateSummaries, getCacheHealth } = require('../services/topicSummaryService');

let isJobRunning = false;
let lastRunTime = null;
let lastRunStats = { 
  successful: 0, 
  failed: 0, 
  total: 0,
  duration: 0
};

/**
 * Get all unique topics from all users
 */
async function getAllUserTopics() {
  try {
    // Aggregate all unique topics from all users
    const result = await User.aggregate([
      { $unwind: '$customTopics' },
      { $group: { _id: '$customTopics' } },
      { $project: { _id: 0, topic: '$_id' } }
    ]);
    
    const topics = result.map(r => r.topic).filter(Boolean);
    console.log(`[TOPIC SUMMARIES] Found ${topics.length} unique topics across all users`);
    
    return topics;
  } catch (error) {
    console.error('[TOPIC SUMMARIES] Error getting user topics:', error.message);
    return [];
  }
}

/**
 * Get frequency of each topic (how many users follow it)
 */
async function getTopicFrequency() {
  try {
    const result = await User.aggregate([
      { $unwind: '$customTopics' },
      { $group: { _id: '$customTopics', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, topic: '$_id', count: 1 } }
    ]);
    
    return result;
  } catch (error) {
    console.error('[TOPIC SUMMARIES] Error getting topic frequency:', error.message);
    return [];
  }
}

/**
 * Main job function - generate summaries for all popular topics
 */
async function generateAllTopicSummaries() {
  if (isJobRunning) {
    console.log('[TOPIC SUMMARIES] Job already running, skipping...');
    return;
  }
  
  isJobRunning = true;
  const startTime = Date.now();
  
  console.log('\n========================================');
  console.log('🚀 TOPIC SUMMARY GENERATION JOB STARTED');
  console.log('========================================\n');
  
  try {
    // Get all unique topics from users
    const allTopics = await getAllUserTopics();
    
    if (allTopics.length === 0) {
      console.log('[TOPIC SUMMARIES] No topics found, skipping generation');
      lastRunStats = { successful: 0, failed: 0, total: 0, duration: 0 };
      return;
    }
    
    // Get topic frequency for prioritization
    const topicFrequency = await getTopicFrequency();
    console.log('\n📊 Top 10 Most Popular Topics:');
    topicFrequency.slice(0, 10).forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.topic} (${t.count} users)`);
    });
    console.log('');
    
    // Pre-generate summaries for all topics
    // Support multiple word counts for flexibility
    const wordCounts = [200, 300]; // Most common word counts
    
    for (const wordCount of wordCounts) {
      console.log(`\n📝 Generating ${wordCount}-word summaries for ${allTopics.length} topics...`);
      
      const results = await preGenerateSummaries(allTopics, {
        wordCount,
        country: 'us',
        forceRefresh: true
      });
      
      const successful = results.filter(r => r.summary && !r.summary.includes('Unable to')).length;
      const failed = results.length - successful;
      
      console.log(`✅ ${wordCount}-word summaries: ${successful} successful, ${failed} failed`);
    }
    
    // Calculate statistics
    const duration = Date.now() - startTime;
    const totalGenerated = allTopics.length * wordCounts.length;
    
    lastRunStats = {
      successful: allTopics.length,
      failed: 0,
      total: totalGenerated,
      duration: duration
    };
    
    lastRunTime = new Date();
    
    // Show cache health
    const health = await getCacheHealth();
    console.log('\n📊 Cache Health After Generation:');
    console.log(`   Total cached summaries: ${health.total}`);
    console.log(`   Status: ${health.message}`);
    console.log(`   Newest: ${health.newestAge}`);
    
    console.log('\n========================================');
    console.log(`✅ JOB COMPLETED in ${(duration / 1000).toFixed(1)}s`);
    console.log(`   Generated: ${totalGenerated} summaries`);
    console.log(`   Next run: ${getNextRunTime()}`);
    console.log('========================================\n');
    
  } catch (error) {
    console.error('❌ [TOPIC SUMMARIES] Job failed:', error.message);
    console.error(error.stack);
  } finally {
    isJobRunning = false;
  }
}

/**
 * Get next scheduled run time
 */
function getNextRunTime() {
  const now = new Date();
  const next = new Date(now);
  
  // Job runs every 6 hours: 12am, 6am, 12pm, 6pm
  const hours = now.getHours();
  if (hours < 6) {
    next.setHours(6, 0, 0, 0);
  } else if (hours < 12) {
    next.setHours(12, 0, 0, 0);
  } else if (hours < 18) {
    next.setHours(18, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }
  
  return next.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

/**
 * Start the scheduled job
 */
function startJob() {
  console.log('📅 Starting Topic Summary Generation Job (every 6 hours: 12am, 6am, 12pm, 6pm ET)');
  
  // Run every 6 hours at 12am, 6am, 12pm, 6pm Eastern Time
  cron.schedule('0 0,6,12,18 * * *', async () => {
    await generateAllTopicSummaries();
  }, {
    scheduled: true,
    timezone: 'America/New_York'
  });
  
  console.log(`   Next run: ${getNextRunTime()}`);
  
  // Optional: Run immediately on startup for testing (comment out in production)
  // setTimeout(() => {
  //   console.log('🔧 Running initial summary generation...');
  //   generateAllTopicSummaries();
  // }, 5000); // Wait 5 seconds after startup
}

/**
 * Get job status for monitoring endpoint
 */
function getJobStatus() {
  return {
    isRunning: isJobRunning,
    lastRunTime,
    lastRunStats,
    nextRunTime: getNextRunTime(),
    schedule: 'Every 6 hours (12am, 6am, 12pm, 6pm ET)'
  };
}

/**
 * Manually trigger the job (for admin/testing)
 */
async function triggerManually() {
  console.log('🔧 Manual trigger requested');
  return await generateAllTopicSummaries();
}

module.exports = {
  startJob,
  getJobStatus,
  triggerManually,
  generateAllTopicSummaries
};
