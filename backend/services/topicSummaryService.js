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
    
    // Prepare articles for ChatGPT (limit to 4 best articles)
    const articleTexts = articles.slice(0, 4).map((article, index) => {
      const title = (article.title || "")
        .replace(/[\s\-–—]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
      
      const description = (article.description || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 150);
      
      const source = typeof article.source === 'object' 
        ? (article.source?.name || article.source?.id || "Unknown")
        : (article.source || "Unknown");
        
      return `${index + 1}. **${title}** (${source})\n${description}`;
    }).join("\n\n");
    
    const upliftingPrefix = goodNewsOnly ? "uplifting " : "";
    
    // Optimized prompt for per-topic summary generation
    const prompt = `Create ${upliftingPrefix}${topic} news summary (~${wordCount} words). Conversational tone, specific details.

Articles:
${articleTexts}

Requirements:
- DO NOT include any topic headers, titles, or labels (e.g. "**${topic} News Summary**")
- Start directly with the news content
- Include specific names, numbers, facts (avoid vague statements like "there are developments")
- Identify people with context (e.g., "CEO of Tesla" not just "John")
- Use \\n\\n for paragraph breaks (2-4 sentences each)
- Target ${wordCount} words, end at complete sentence
- Focus on most significant developments

After summary add:
---METADATA---
{"enhancedTags":["relevant topics"],"sentiment":"positive/negative/neutral/mixed","keyEntities":["people, orgs, places"],"importance":"low/medium/high"}`;
    
    console.log(`[TOPIC SUMMARY] Sending ${articles.length} articles to ChatGPT for "${topic}"`);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Professional news presenter. Create engaging, factual summaries with specific details (names, numbers, facts). Never write vague meta-commentary. Always identify people with context. Use \\n\\n for paragraph breaks. Include metadata as JSON. NEVER include topic headers or titles in the summary - start directly with the news content."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: Math.min(Math.ceil(wordCount * 1.5) + 150, 1800),
      temperature: 0.4,
    });
    
    let fullResponse = completion.choices[0]?.message?.content?.trim();
    
    if (!fullResponse) {
      throw new Error("No summary generated by ChatGPT");
    }
    
    // Parse summary and metadata
    let summary = fullResponse;
    let metadata = {
      enhancedTags: [topic],
      sentiment: "neutral",
      keyEntities: [],
      importance: "medium"
    };
    
    // Extract metadata if present
    if (fullResponse.includes('---METADATA---')) {
      const parts = fullResponse.split('---METADATA---');
      summary = parts[0].trim();
      
      try {
        const metadataText = parts[1].trim();
        const jsonMatch = metadataText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedMetadata = JSON.parse(jsonMatch[0]);
          metadata = {
            enhancedTags: parsedMetadata.enhancedTags || metadata.enhancedTags,
            sentiment: parsedMetadata.sentiment || metadata.sentiment,
            keyEntities: parsedMetadata.keyEntities || metadata.keyEntities,
            importance: parsedMetadata.importance || metadata.importance
          };
          console.log(`✅ [TOPIC SUMMARY] Metadata extracted for "${topic}":`, metadata);
        }
      } catch (parseError) {
        console.warn(`⚠️ [TOPIC SUMMARY] Failed to parse metadata for "${topic}":`, parseError.message);
      }
    }
    
    // Ensure summary ends at a complete sentence
    summary = ensureCompleteSentence(summary);
    
    const actualWordCount = summary.split(/\s+/).length;
    console.log(`✅ [TOPIC SUMMARY] Generated summary for "${topic}": ${actualWordCount} words (target: ${wordCount})`);
    
    return { summary, metadata };
    
  } catch (error) {
    console.error(`[TOPIC SUMMARY] ChatGPT failed for "${topic}":`, error.message);
    
    // Simple fallback
    const titles = articles.slice(0, 3).map(a => a.title || "").filter(Boolean);
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
