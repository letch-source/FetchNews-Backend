/**
 * Topic Summary Service
 * Manages generation and retrieval of per-topic summaries with caching
 * 
 * This service enables efficient summary generation where each topic's summary
 * is generated once and cached for reuse across all users.
 */

const TopicSummaryCache = require('../models/TopicSummaryCache');
const { fetchArticlesFromCache } = require('./cachedArticleFetcher');
const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Get or generate a summary for a single topic
 * Uses cache-first strategy: check cache, generate if needed
 * 
 * @param {string} topic - Topic name
 * @param {Object} options - Options for summary generation
 * @returns {Object} { summary, metadata, sourceArticles, fromCache }
 */
async function getTopicSummary(topic, options = {}) {
  const {
    wordCount = 200,
    country = 'us',
    goodNewsOnly = false,
    excludedSources = [],
    forceRefresh = false
  } = options;
  
  console.log(`[TOPIC SUMMARY] Getting summary for "${topic}" (${wordCount} words, ${country})`);
  
  // Try to get from cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = await TopicSummaryCache.getCachedSummary(topic, wordCount, country);
    if (cached) {
      return {
        summary: cached.summary,
        metadata: cached.metadata,
        sourceArticles: cached.sourceArticles,
        fromCache: true,
        articleCount: cached.articleCount
      };
    }
  }
  
  // Cache miss or force refresh - generate new summary
  console.log(`[TOPIC SUMMARY] Generating new summary for "${topic}"`);
  
  try {
    // Fetch articles from cache
    const { articles } = await fetchArticlesFromCache(topic, null, 20, excludedSources);
    
    if (!articles || articles.length === 0) {
      console.warn(`[TOPIC SUMMARY] No articles found for "${topic}"`);
      return {
        summary: `No recent coverage found for ${topic}.`,
        metadata: {},
        sourceArticles: [],
        fromCache: false,
        articleCount: 0
      };
    }
    
    // Filter uplifting news if requested
    let relevantArticles = articles;
    if (goodNewsOnly) {
      relevantArticles = articles.filter(article => {
        const text = `${article.title} ${article.description}`.toLowerCase();
        const upliftingKeywords = ['success', 'win', 'breakthrough', 'achieve', 'improve', 'positive', 'help', 'save', 'rescue', 'celebrate'];
        const negativeKeywords = ['death', 'kill', 'crash', 'attack', 'war', 'crisis', 'scandal', 'threat'];
        const upliftingScore = upliftingKeywords.filter(k => text.includes(k)).length;
        const negativeScore = negativeKeywords.filter(k => text.includes(k)).length;
        return upliftingScore > negativeScore;
      });
      
      // Fall back to all articles if too few uplifting ones
      if (relevantArticles.length < 2) {
        relevantArticles = articles;
      }
    }
    
    // Generate summary using OpenAI
    const { summary, metadata } = await generateSummaryWithAI(topic, relevantArticles, wordCount, goodNewsOnly);
    
    // Cache the summary for future use
    await TopicSummaryCache.cacheSummary(
      topic,
      summary,
      wordCount,
      country,
      metadata,
      relevantArticles.slice(0, 5) // Store first 5 articles as sources
    );
    
    return {
      summary,
      metadata,
      sourceArticles: relevantArticles.slice(0, 5),
      fromCache: false,
      articleCount: relevantArticles.length
    };
    
  } catch (error) {
    console.error(`[TOPIC SUMMARY] Error generating summary for "${topic}":`, error.message);
    return {
      summary: `Unable to generate summary for ${topic} at this time.`,
      metadata: {},
      sourceArticles: [],
      fromCache: false,
      articleCount: 0
    };
  }
}

/**
 * Get summaries for multiple topics in parallel
 * @param {Array} topics - Array of topic names
 * @param {Object} options - Options for summary generation
 * @returns {Array} Array of { topic, summary, metadata, sourceArticles, fromCache }
 */
async function getMultipleTopicSummaries(topics, options = {}) {
  console.log(`[TOPIC SUMMARY] Getting summaries for ${topics.length} topics...`);
  
  const summaryPromises = topics.map(topic => 
    getTopicSummary(topic, options)
      .then(result => ({ topic, ...result }))
      .catch(error => {
        console.error(`[TOPIC SUMMARY] Failed to get summary for "${topic}":`, error.message);
        return {
          topic,
          summary: `Unable to fetch ${topic} news.`,
          metadata: {},
          sourceArticles: [],
          fromCache: false,
          articleCount: 0
        };
      })
  );
  
  const results = await Promise.all(summaryPromises);
  
  const cacheHits = results.filter(r => r.fromCache).length;
  const cacheMisses = results.length - cacheHits;
  console.log(`[TOPIC SUMMARY] Results: ${cacheHits} cache hits, ${cacheMisses} new generations`);
  
  return results;
}

/**
 * Generate a summary using OpenAI ChatGPT
 * @param {string} topic - Topic name
 * @param {Array} articles - Array of articles
 * @param {number} wordCount - Target word count
 * @param {boolean} goodNewsOnly - Only uplifting news
 * @returns {Object} { summary, metadata }
 */
async function generateSummaryWithAI(topic, articles, wordCount, goodNewsOnly = false) {
  if (!OPENAI_API_KEY) {
    console.warn("[TOPIC SUMMARY] OpenAI API key not configured, using simple fallback");
    const titles = articles.slice(0, 3).map(a => a.title).join('. ');
    return {
      summary: `Here's your ${topic} news. ${titles}.`,
      metadata: {}
    };
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Prepare articles — limit to 4, structured as indexed objects for source-tracking
    const limitedArticles = articles.slice(0, 4).map((article, index) => ({
      index: index + 1,
      title: (article.title || '').replace(/[\s\-–—]+$/g, '').replace(/\s+/g, ' ').trim(),
      description: (article.description || '').replace(/\s+/g, ' ').trim().slice(0, 150),
      source: typeof article.source === 'object'
        ? (article.source?.name || article.source?.id || 'Unknown')
        : (article.source || 'Unknown'),
      url: article.url || ''
    }));

    const upliftingPrefix = goodNewsOnly ? 'uplifting ' : '';

    const prompt = `Summarize ${upliftingPrefix}${topic} news in about ${wordCount} words.
Use ONLY facts that are explicitly present in the provided articles.
Do NOT infer, speculate, embellish, or combine facts not directly supported by the text.
If a detail is missing, omit it rather than filling it in.
Do NOT include topic headers or titles — start directly with the news content.
Identify people with context (e.g. "Apple CEO Tim Cook", not just "Cook").
Use \\n\\n for paragraph breaks.

Return valid JSON only with these keys:
- "summary": the news summary string
- "metadata": object with keys enhancedTags (array), sentiment (positive/negative/neutral/mixed), keyEntities (array), importance (low/medium/high)
- "sourceIndexes": array of article index numbers you drew facts from

Articles:
${JSON.stringify(limitedArticles, null, 2)}`;

    console.log(`[TOPIC SUMMARY] Sending ${limitedArticles.length} articles to ChatGPT for "${topic}"`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a careful news summarizer. Use only the supplied article facts. Never add unsupported details, speculation, or inferred context.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: Math.min(Math.ceil(wordCount * 1.5) + 200, 1800),
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('No summary generated by ChatGPT');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      // JSON parse failed — fall back to article titles so we never return ungrounded text
      console.warn(`⚠️ [TOPIC SUMMARY] JSON parse failed for "${topic}", using title fallback:`, parseError.message);
      const titles = limitedArticles.map(a => a.title).filter(Boolean);
      return {
        summary: ensureCompleteSentence(titles.join('. ')),
        metadata: { enhancedTags: [topic], sentiment: 'neutral', keyEntities: [], importance: 'medium' }
      };
    }

    const summary = ensureCompleteSentence(String(parsed.summary || '').trim());
    const meta = parsed.metadata || {};
    const sourceIndexes = Array.isArray(parsed.sourceIndexes)
      ? parsed.sourceIndexes.filter(i => Number.isInteger(i) && i >= 1 && i <= limitedArticles.length)
      : [];

    const metadata = {
      enhancedTags: Array.isArray(meta.enhancedTags) ? meta.enhancedTags : [topic],
      sentiment: meta.sentiment || 'neutral',
      keyEntities: Array.isArray(meta.keyEntities) ? meta.keyEntities : [],
      importance: meta.importance || 'medium',
      sourceIndexes
    };

    const actualWordCount = summary.split(/\s+/).length;
    console.log(`✅ [TOPIC SUMMARY] Generated summary for "${topic}": ${actualWordCount} words (target: ${wordCount})`);

    return { summary, metadata };

  } catch (error) {
    console.error(`[TOPIC SUMMARY] ChatGPT failed for "${topic}":`, error.message);

    // Title-based fallback — never return ungrounded model text
    const titles = articles.slice(0, 3).map(a => a.title || '').filter(Boolean);
    return {
      summary: `Here's your ${topic} news. ${titles.join('. ')}.`,
      metadata: {}
    };
  }
}

/**
 * Ensure summary ends at a complete sentence
 */
function ensureCompleteSentence(text) {
  if (!text) return text;
  
  // Find the last sentence-ending punctuation
  const lastPeriod = text.lastIndexOf('.');
  const lastQuestion = text.lastIndexOf('?');
  const lastExclamation = text.lastIndexOf('!');
  
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);
  
  // If the text doesn't end with punctuation, truncate to last complete sentence
  if (lastSentenceEnd > 0 && lastSentenceEnd < text.length - 1) {
    return text.substring(0, lastSentenceEnd + 1).trim();
  }
  
  return text.trim();
}

/**
 * Pre-generate summaries for a list of topics
 * Useful for scheduled jobs to warm the cache
 * @param {Array} topics - Array of topic names
 * @param {Object} options - Options for summary generation
 */
async function preGenerateSummaries(topics, options = {}) {
  console.log(`[TOPIC SUMMARY] Pre-generating summaries for ${topics.length} topics...`);
  
  const results = await getMultipleTopicSummaries(topics, {
    ...options,
    forceRefresh: true // Always generate fresh summaries
  });
  
  const successful = results.filter(r => r.summary && !r.summary.includes('Unable to')).length;
  console.log(`[TOPIC SUMMARY] Pre-generation complete: ${successful}/${topics.length} successful`);
  
  return results;
}

/**
 * Get cache health and statistics
 */
async function getCacheHealth() {
  try {
    const stats = await TopicSummaryCache.getStats();
    
    const ageInHours = stats.newestSummary 
      ? (new Date() - new Date(stats.newestSummary)) / (1000 * 60 * 60)
      : null;
    
    return {
      healthy: stats.total > 0 && ageInHours < 6,
      total: stats.total,
      newestAge: ageInHours ? `${ageInHours.toFixed(1)} hours ago` : 'N/A',
      oldestAge: stats.oldestSummary 
        ? `${((new Date() - new Date(stats.oldestSummary)) / (1000 * 60 * 60)).toFixed(1)} hours ago`
        : 'N/A',
      topTopics: stats.byTopic.slice(0, 10),
      message: stats.total === 0
        ? 'Cache is empty - summary generation job may not be running'
        : ageInHours > 6
        ? 'Cache is stale - summary generation job may have failed'
        : 'Cache is healthy'
    };
  } catch (error) {
    console.error('[TOPIC SUMMARY] Error checking cache health:', error.message);
    return {
      healthy: false,
      message: `Error checking cache: ${error.message}`
    };
  }
}

module.exports = {
  getTopicSummary,
  getMultipleTopicSummaries,
  preGenerateSummaries,
  getCacheHealth
};
