/**
 * Automatic Summary Fetch Job
 * 
 * Runs at 6AM and 6PM daily to generate summaries for all users
 * based on their selected topics (customTopics).
 */

const cron = require('node-cron');
const User = require('../models/User');
const { getMultipleTopicSummaries } = require('../services/topicSummaryService');
const { fetchArticlesFromCache } = require('../services/cachedArticleFetcher');
const { sendFetchReadyNotification } = require('../utils/notifications');
const { generateTTS } = require('../services/ttsService');

let isJobRunning = false;
let lastRunTime = null;
let lastRunStats = { success: 0, failed: 0, total: 0 };

/**
 * Send a morning Fetch notification (does not depend on summary completion)
 */
async function sendMorningFetchNotification(user, fetchTitle) {
  const deviceToken = user.deviceToken || user.preferences?.deviceToken || null;
  if (!deviceToken) {
    return { success: false, reason: 'no_device_token' };
  }

  const notificationResult = await sendFetchReadyNotification(deviceToken, fetchTitle);
  if (notificationResult === 'BAD_TOKEN') {
    console.log(`⚠️  Invalid device token detected for ${user.email}, clearing token`);
    user.deviceToken = null;
    await user.save();
    return { success: false, reason: 'bad_token' };
  }

  if (notificationResult) {
    console.log(`🔔 Sent morning Fetch notification to ${user.email}`);
    return { success: true };
  }

  console.log(`⚠️  Failed to send morning Fetch notification to ${user.email}`);
  return { success: false, reason: 'send_failed' };
}

/**
 * Build the combined topic list for a user, merging selectedTopics and customTopics.
 * Deduplicates and filters empty values.
 */
function getUserTopicsForAutoFetch(user) {
  const selectedTopics = Array.isArray(user.selectedTopics) ? user.selectedTopics : [];
  const customTopics = Array.isArray(user.customTopics) ? user.customTopics : [];
  return [...new Set(
    [...selectedTopics, ...customTopics]
      .map(topic => String(topic || '').trim())
      .filter(Boolean)
  )];
}

/**
 * Generate summaries for a single user from cached articles
 */
async function generateUserSummaries(user) {
  try {
    const topics = getUserTopicsForAutoFetch(user);

    if (!topics.length) {
      console.log(`⏭️  Skipping user ${user.email} - no selected/custom topics`);
      return { success: false, reason: 'no_topics' };
    }

    console.log(`📰 Generating summaries for ${user.email} - ${topics.length} topics`);

    // Get user preferences
    const wordCount = user.summaryLength ? parseInt(user.summaryLength, 10) : 200;
    const country = user.selectedCountry || 'us';
    const goodNewsOnly = user.upliftingNewsOnly || false;

    // Get cached summaries for all user's topics
    const topicResults = await getMultipleTopicSummaries(topics, {
      wordCount,
      country,
      goodNewsOnly,
      excludedSources: user.excludedNewsSources || []
    });

    if (!topicResults || topicResults.length === 0) {
      console.log(`⚠️  No summaries generated for ${user.email}`);
      return { success: false, reason: 'no_summaries' };
    }

    // Filter out failed topics
    const successfulTopics = topicResults.filter(r => r.summary && r.articleCount > 0);
    
    if (successfulTopics.length === 0) {
      console.log(`⚠️  All topics failed for ${user.email}`);
      return { success: false, reason: 'all_topics_failed' };
    }

    const selectedVoice = (user.selectedVoice || 'alloy').toLowerCase();
    const playbackRate = Number(user.playbackRate || 1.0);
    const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '';

    // Build topic sections with per-topic audio
    const topicSections = await Promise.all(successfulTopics.map(async (result) => {
      // Fetch a few articles for each topic to display as sources
      let articles = [];
      try {
        const { articles: cachedArticles } = await fetchArticlesFromCache(result.topic, null, 5, user.excludedNewsSources || []);
        articles = cachedArticles.slice(0, 5).map((a, idx) => ({
          id: `${result.topic}-${idx}-${Date.now()}`,
          title: a.title || "",
          summary: (a.description || "").slice(0, 180),
          source: typeof a.source === 'object' ? (a.source?.name || a.source?.id || "") : (a.source || ""),
          url: a.url || "",
          topic: result.topic,
          imageUrl: a.urlToImage || ""
        }));
      } catch (fetchErr) {
        console.warn(`Could not fetch articles for ${result.topic}:`, fetchErr.message);
      }

      // Generate per-topic audio
      let topicAudioUrl = null;
      try {
        const audio = await generateTTS(result.summary, selectedVoice, playbackRate, baseUrl);
        topicAudioUrl = audio.audioUrl;
      } catch (audioErr) {
        console.warn(`Audio generation failed for ${result.topic}:`, audioErr.message);
      }

      return {
        id: `topic-${result.topic.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        topic: result.topic,
        summary: result.summary,
        articles: articles,
        audioUrl: topicAudioUrl,
        metadata: result.metadata || {}
      };
    }));

    // Get time-based title in PST to match cron schedule
    const now = new Date();
    const pstHour = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      hour12: false
    }).formatToParts(now).find(part => part.type === 'hour').value, 10);
    let timeOfDay = 'Morning';
    if (pstHour >= 12 && pstHour < 17) timeOfDay = 'Afternoon';
    else if (pstHour >= 17 || pstHour < 5) timeOfDay = 'Evening';

    const title = `${timeOfDay} Fetch`;

    // Generate combined audio for the full fetch
    let combinedAudioUrl = null;
    try {
      const combinedText = successfulTopics
        .map(result => `${result.topic}. ${result.summary}`)
        .join('\n\n');
      const combinedAudio = await generateTTS(combinedText, selectedVoice, playbackRate, baseUrl);
      combinedAudioUrl = combinedAudio.audioUrl;
    } catch (audioErr) {
      console.warn(`Combined auto-fetch audio failed for ${user.email}:`, audioErr.message);
    }

    // Add to user's history
    await user.addSummaryToHistory({
      title,
      summary: `Your ${timeOfDay.toLowerCase()} news update covering ${topicSections.length} topics.`,
      audioUrl: combinedAudioUrl,
      topicSections: topicSections,
      sources: []
    });

    console.log(`✅ Generated summaries for ${user.email} - ${topicSections.length} topics`);
    return { success: true, topicCount: topicSections.length };

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
    // Determine time-of-day in PST once for this run
    const now = new Date();
    const pstHour = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      hour12: false
    }).formatToParts(now).find(part => part.type === 'hour').value, 10);
    const isMorningRun = pstHour >= 5 && pstHour < 12;

    if (isMorningRun) {
      const notificationUsers = await User.find({});
      console.log(`🔔 Morning notifications: ${notificationUsers.length} users (sending when token exists)`);

      for (const user of notificationUsers) {
        await sendMorningFetchNotification(user, 'Morning Fetch');
      }
    }

    // Get all users who have either selectedTopics or customTopics
    const users = await User.find({
      $or: [
        { selectedTopics: { $exists: true, $not: { $size: 0 } } },
        { customTopics: { $exists: true, $not: { $size: 0 } } }
      ]
    });

    console.log(`👥 Found ${users.length} users with selected/custom topics`);

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
