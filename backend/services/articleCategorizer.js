/**
 * Article Categorization Service
 * Uses ChatGPT to categorize articles into topics
 */

const OpenAI = require('openai');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Core categories with subtopics for better categorization
const CORE_CATEGORIES_WITH_SUBTOPICS = {
  'general': {
    name: 'general',
    description: 'General news and current events',
    subtopics: ['breaking news', 'current events', 'local news', 'national news', 'world news']
  },
  'business': {
    name: 'business',
    description: 'Business, finance, and economy',
    subtopics: ['markets', 'stocks', 'finance', 'economy', 'companies', 'startups', 'cryptocurrency', 'real estate', 'banking', 'investing']
  },
  'technology': {
    name: 'technology',
    description: 'Technology and computing',
    subtopics: ['AI', 'artificial intelligence', 'software', 'hardware', 'gadgets', 'apps', 'social media', 'cybersecurity', 'internet', 'tech companies', 'innovation', 'robotics', 'gaming']
  },
  'sports': {
    name: 'sports',
    description: 'Sports and athletics',
    subtopics: ['football', 'basketball', 'baseball', 'soccer', 'tennis', 'olympics', 'athletes', 'teams', 'competitions', 'championships', 'sports news']
  },
  'entertainment': {
    name: 'entertainment',
    description: 'Entertainment and pop culture',
    subtopics: ['movies', 'films', 'TV shows', 'television', 'music', 'celebrities', 'actors', 'musicians', 'awards', 'Hollywood', 'streaming', 'concerts', 'box office', 'albums', 'pop culture', 'fashion']
  },
  'health': {
    name: 'health',
    description: 'Health and wellness',
    subtopics: ['medical news', 'diseases', 'treatments', 'hospitals', 'doctors', 'mental health', 'fitness', 'nutrition', 'wellness', 'healthcare', 'medicine', 'vaccines', 'public health']
  },
  'science': {
    name: 'science',
    description: 'Science and research',
    subtopics: ['research', 'discoveries', 'space', 'NASA', 'astronomy', 'physics', 'chemistry', 'biology', 'climate', 'environment', 'nature', 'studies', 'experiments', 'scientists']
  }
};

// Core category names (for backward compatibility)
const CORE_CATEGORIES = Object.keys(CORE_CATEGORIES_WITH_SUBTOPICS);

/**
 * Helper to slugify custom topic names for use as category keys
 */
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-');     // Replace multiple hyphens with single
}

/**
 * Categorize a batch of articles using ChatGPT
 * @param {Array} articles - Array of article objects with title and description
 * @param {Array} customTopics - Array of user custom topic strings
 * @param {string} model - OpenAI model to use (default: gpt-4o-mini for cost)
 * @returns {Array} Array of objects with { index, categories }
 */
async function categorizeArticlesBatch(articles, customTopics = [], model = 'gpt-4o-mini') {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  if (!articles || articles.length === 0) {
    return [];
  }

  // Prepare articles for ChatGPT
  const articlesForPrompt = articles.map((article, index) => ({
    id: index,
    title: article.title || '',
    description: (article.description || '').substring(0, 300) // Limit description length
  }));

  // Build category list (core + custom topics)
  const slugifiedCustomTopics = customTopics.map(slugify);
  const allCategories = [...CORE_CATEGORIES, ...slugifiedCustomTopics];

  // Build prompt with core categories (including subtopics) and custom topics
  let categorySection = `CORE CATEGORIES (with subtopics to help you categorize):\n\n`;
  
  CORE_CATEGORIES.forEach(catName => {
    const cat = CORE_CATEGORIES_WITH_SUBTOPICS[catName];
    categorySection += `- ${cat.name}: ${cat.description}\n`;
    categorySection += `  Examples: ${cat.subtopics.join(', ')}\n\n`;
  });
  
  if (slugifiedCustomTopics.length > 0) {
    categorySection += `USER CUSTOM TOPICS (match these if the article is specifically about these topics):\n`;
    categorySection += slugifiedCustomTopics.map(cat => `- ${cat}`).join('\n');
  }

  const prompt = `You are a news article categorizer. Categorize each article into one or more of these categories:

${categorySection}

Rules:
- An article can have multiple categories (e.g., a tech company's stock news could be both "business" and "technology")
- Use the subtopics/examples to guide your categorization (e.g., if an article mentions "celebrities" or "actors", it should be categorized as "entertainment")
- If an article mentions anything in the subtopics list, include that core category
- Use "general" ONLY for articles that don't fit any other categories
- ALWAYS include at least one core category
- Add custom topics when they specifically match the article content
- Examples:
  * Article about Taylor Swift → "entertainment" (celebrities, music)
  * Article about a movie premiere → "entertainment" (movies, films)
  * Article about SpaceX → "technology" and "science" (space, companies)
  * Article about a medical breakthrough → "health" and "science" (medical news, research)
  * Article about stock market → "business" (markets, stocks)
  * Article about Instagram update → "technology" (social media, apps)

Articles to categorize:
${articlesForPrompt.map(a => `${a.id}. "${a.title}" - ${a.description}`).join('\n\n')}

Return a JSON object with an "articles" array in this exact format:
{
  "articles": [
    { "id": 0, "categories": ["technology", "business"] },
    { "id": 1, "categories": ["health", "science", "mental-health"] }
  ]
}`;

  try {
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a news article categorization assistant. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent categorization
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });

    const duration = Date.now() - startTime;
    const usage = response.usage;
    
    console.log(`[CATEGORIZER] ChatGPT categorization complete in ${duration}ms`);
    console.log(`[CATEGORIZER] Tokens used: ${usage.prompt_tokens} input + ${usage.total_tokens - usage.prompt_tokens} output = ${usage.total_tokens} total`);
    console.log(`[CATEGORIZER] Estimated cost: $${estimateCost(usage, model)}`);

    const content = response.choices[0].message.content;
    let result;
    
    try {
      const parsed = JSON.parse(content);
      // Handle multiple response formats
      result = Array.isArray(parsed) ? parsed : (parsed.articles || parsed.categories || parsed.results || []);
      
      if (!Array.isArray(result)) {
        console.error('[CATEGORIZER] Unexpected response format:', content);
        throw new Error('ChatGPT response does not contain an array');
      }
    } catch (parseError) {
      console.error('[CATEGORIZER] Failed to parse ChatGPT response:', content);
      throw new Error('Invalid JSON response from ChatGPT');
    }

    if (!Array.isArray(result)) {
      throw new Error('ChatGPT did not return an array');
    }

    console.log(`[CATEGORIZER] Successfully categorized ${result.length} articles`);
    return result;
  } catch (error) {
    console.error('[CATEGORIZER] Error calling ChatGPT:', error.message);
    throw error;
  }
}

/**
 * Estimate cost of OpenAI API call
 */
function estimateCost(usage, model) {
  let inputCost, outputCost;
  
  if (model === 'gpt-4o-mini') {
    inputCost = 0.15 / 1_000_000;   // $0.15 per 1M input tokens
    outputCost = 0.60 / 1_000_000;  // $0.60 per 1M output tokens
  } else if (model === 'gpt-4o') {
    inputCost = 2.50 / 1_000_000;   // $2.50 per 1M input tokens
    outputCost = 10.00 / 1_000_000; // $10.00 per 1M output tokens
  } else {
    return 'unknown';
  }
  
  const cost = (usage.prompt_tokens * inputCost) + 
               ((usage.total_tokens - usage.prompt_tokens) * outputCost);
  
  return cost.toFixed(4);
}

/**
 * Categorize all articles in batches
 * Processes 100 articles per ChatGPT request for efficiency
 * @param {Array} articles - Array of articles to categorize
 * @param {Array} customTopics - Array of user custom topic strings
 * @param {number} batchSize - Number of articles per batch
 * @param {string} model - OpenAI model to use
 */
async function categorizeAllArticles(articles, customTopics = [], batchSize = 100, model = 'gpt-4o-mini') {
  console.log(`[CATEGORIZER] Starting categorization of ${articles.length} articles in batches of ${batchSize}...`);
  console.log(`[CATEGORIZER] Using ${CORE_CATEGORIES.length} core categories + ${customTopics.length} custom topics`);
  
  const results = [];
  let totalCost = 0;
  
  // Process in batches
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    console.log(`[CATEGORIZER] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(articles.length / batchSize)} (${batch.length} articles)...`);
    
    try {
      const batchResults = await categorizeArticlesBatch(batch, customTopics, model);
      
      // Map results back to original articles
      batchResults.forEach(result => {
        const globalIndex = i + result.id;
        if (globalIndex < articles.length) {
          results.push({
            article: articles[globalIndex],
            categories: result.categories || ['general']
          });
        }
      });
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    } catch (error) {
      console.error(`[CATEGORIZER] Error processing batch starting at index ${i}:`, error.message);
      
      // Fallback: mark articles as 'general' if categorization fails
      batch.forEach((article, batchIndex) => {
        results.push({
          article,
          categories: ['general'],
          error: true
        });
      });
    }
  }
  
  console.log(`[CATEGORIZER] ✅ Categorization complete: ${results.length} articles processed`);
  
  // Category statistics
  const categoryStats = {};
  results.forEach(result => {
    result.categories.forEach(cat => {
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    });
  });
  
  console.log(`[CATEGORIZER] Category distribution:`, categoryStats);
  
  return results;
}

/**
 * Validate categories (allows both core and custom topics)
 */
function validateCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return ['general'];
  }
  
  // Keep all categories (both core and custom slugified topics are valid)
  const valid = categories.filter(cat => typeof cat === 'string' && cat.length > 0);
  
  // If no valid categories, default to general
  return valid.length > 0 ? valid : ['general'];
}

/**
 * Extract trending topics from articles using GPT
 * Analyzes article titles and descriptions to identify the most relevant topics
 * @param {Array} articles - Array of articles to analyze
 * @param {number} topCount - Number of trending topics to extract (default: 8)
 * @param {string} model - OpenAI model to use
 * @returns {Array} Array of trending topic strings
 */
async function extractTrendingTopics(articles, topCount = 8, model = 'gpt-4o-mini') {
  if (!OPENAI_API_KEY) {
    console.error('[TRENDING] OpenAI API key not configured');
    return [];
  }

  if (!articles || articles.length === 0) {
    console.log('[TRENDING] No articles to analyze');
    return [];
  }

  // Use a sample of articles for analysis (max 100 for token efficiency)
  const sampleSize = Math.min(articles.length, 100);
  const sample = articles
    .sort(() => 0.5 - Math.random()) // Shuffle
    .slice(0, sampleSize)
    .map(article => ({
      title: article.title || '',
      description: (article.description || '').substring(0, 200)
    }));

  const prompt = `Analyze these ${sample.length} recent news articles and extract the ${topCount} most important and relevant trending topics/keywords.

Guidelines:
- Focus on specific topics, events, people, or themes that appear frequently
- Topics should be 1-3 words maximum (e.g., "AI Development", "Taylor Swift", "Climate Crisis")
- Prioritize topics that would interest news readers
- Avoid generic terms like "news", "update", "report"
- Include a mix of: current events, trending people/celebrities, technology trends, political topics, sports events
- Topics should be appropriate for a general news app audience

Articles:
${sample.map((a, i) => `${i + 1}. "${a.title}" - ${a.description}`).join('\n\n')}

Return ONLY a JSON object with a "topics" array of ${topCount} strings, ordered by relevance:
{
  "topics": ["Topic 1", "Topic 2", "Topic 3", ...]
}`;

  try {
    console.log(`[TRENDING] Analyzing ${sample.length} articles to extract ${topCount} trending topics...`);
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a news analyst expert at identifying trending topics from news articles. Return only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5, // Moderate creativity for diverse topics
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const duration = Date.now() - startTime;
    const usage = response.usage;
    
    console.log(`[TRENDING] GPT analysis complete in ${duration}ms`);
    console.log(`[TRENDING] Tokens used: ${usage.total_tokens} (cost: $${estimateCost(usage, model)})`);

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    const topics = parsed.topics || [];

    if (!Array.isArray(topics)) {
      console.error('[TRENDING] GPT did not return an array');
      return [];
    }

    // Validate and clean topics
    const validTopics = topics
      .filter(t => typeof t === 'string' && t.length > 0 && t.length <= 50)
      .slice(0, topCount);

    console.log(`[TRENDING] ✅ Extracted ${validTopics.length} trending topics: ${validTopics.join(', ')}`);
    
    return validTopics;
  } catch (error) {
    console.error('[TRENDING] Error extracting trending topics:', error.message);
    return [];
  }
}

module.exports = {
  categorizeArticlesBatch,
  categorizeAllArticles,
  validateCategories,
  slugify,
  extractTrendingTopics,
  CORE_CATEGORIES,
  CORE_CATEGORIES_WITH_SUBTOPICS
};
