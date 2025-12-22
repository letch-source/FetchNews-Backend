/**
 * Article Categorization Service
 * Uses ChatGPT to categorize articles into topics
 */

const OpenAI = require('openai');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Core categories (always included)
const CORE_CATEGORIES = [
  'general',      // General news, current events
  'business',     // Business, finance, markets, economy
  'technology',   // Tech products, software, AI, computing
  'sports',       // Sports, athletes, games, competitions
  'entertainment',// Movies, music, celebrities, TV
  'health',       // Medical news, wellness, diseases, treatments
  'science'       // Research, discoveries, space, environment
];

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

  // Build prompt with core categories and custom topics
  let categorySection = `CORE CATEGORIES:\n`;
  categorySection += CORE_CATEGORIES.map(cat => `- ${cat}`).join('\n');
  
  if (slugifiedCustomTopics.length > 0) {
    categorySection += `\n\nUSER CUSTOM TOPICS (match these if relevant):\n`;
    categorySection += slugifiedCustomTopics.map(cat => `- ${cat}`).join('\n');
  }

  const prompt = `You are a news article categorizer. Categorize each article into one or more of these categories:

${categorySection}

Rules:
- An article can have multiple categories (e.g., a tech company's stock news could be both "business" and "technology")
- Use "general" for articles that don't fit other categories
- ALWAYS include at least one core category
- Add custom topics when they match the article content
- Be specific: health articles about medical breakthroughs should include "science"
- Business news about tech companies should include both "business" and "technology"

Articles to categorize:
${articlesForPrompt.map(a => `${a.id}. "${a.title}" - ${a.description}`).join('\n\n')}

Return ONLY a JSON array in this exact format:
[
  { "id": 0, "categories": ["technology", "business"] },
  { "id": 1, "categories": ["health", "science", "mental-health"] }
]`;

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
      // Handle both array and object with array property
      result = Array.isArray(parsed) ? parsed : (parsed.categories || parsed.results || []);
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

module.exports = {
  categorizeArticlesBatch,
  categorizeAllArticles,
  validateCategories,
  slugify,
  CORE_CATEGORIES
};
