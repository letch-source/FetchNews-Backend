/**
 * Topic Intelligence Service
 * Solves the "too broad" and "too specific" topic problems
 * 
 * Problems addressed:
 * 1. Too Broad: "Politics" → user actually wants "U.S. Politics"
 * 2. Too Specific: "RNA research" → too narrow, few articles match
 * 
 * Solutions:
 * - Analyze topic specificity using GPT
 * - Suggest refinements for broad topics
 * - Expand narrow topics with semantic variations
 * - Use user location to contextualize broad topics
 * - Learn from feedback to refine topics over time
 */

const OpenAI = require('openai');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

/**
 * Analyze a topic to determine if it's too broad, too specific, or just right
 * Also provides suggestions for improvement
 * 
 * @param {string} topic - The topic to analyze
 * @param {Object} context - Optional context (userCountry, userRegion, etc.)
 * @returns {Object} { specificity, suggestions, expandedTerms, shouldRefine, shouldExpand }
 */
async function analyzeTopicSpecificity(topic, context = {}) {
  if (!OPENAI_API_KEY) {
    console.warn('[TOPIC_INTELLIGENCE] OpenAI API key not configured, skipping analysis');
    return {
      specificity: 'unknown',
      suggestions: [],
      expandedTerms: [topic],
      shouldRefine: false,
      shouldExpand: false
    };
  }

  const { userCountry = 'us', userRegion = null } = context;

  const prompt = `Analyze this news topic for specificity: "${topic}"

User context:
- Country: ${userCountry}
- Region: ${userRegion || 'unknown'}

Determine:
1. Is this topic TOO BROAD (too general, needs refinement)?
   Examples: "Politics", "Sports", "Technology", "News"
   
2. Is this topic TOO SPECIFIC (too narrow, unlikely to find many articles)?
   Examples: "RNA polymerase research", "Quantum entanglement in superconductors", "Pickleball tournaments in Vermont"
   
3. Or is it JUST RIGHT (good balance)?
   Examples: "U.S. Politics", "NFL", "Artificial Intelligence", "Climate Change"

For TOO BROAD topics:
- Suggest 3-5 refined versions based on user's country/region
- Example: "Politics" → ["U.S. Politics", "U.S. Elections", "Congress", "White House"]

For TOO SPECIFIC topics:
- Suggest 3-5 related broader topics that would capture similar content
- Provide semantic variations/synonyms that might appear in news articles
- Example: "RNA research" → ["genetics", "molecular biology", "biotech research", "gene therapy"]

For JUST RIGHT topics:
- Provide 2-3 semantic variations (synonyms) that might appear in articles
- Example: "Artificial Intelligence" → ["AI", "machine learning", "AI technology"]

Return JSON in this exact format:
{
  "specificity": "too_broad" | "too_specific" | "just_right",
  "reasoning": "brief explanation",
  "suggestions": ["suggestion1", "suggestion2", ...],
  "expandedTerms": ["term1", "term2", ...],
  "shouldRefine": boolean,
  "shouldExpand": boolean
}`;

  try {
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cost-effective model
      messages: [
        {
          role: 'system',
          content: 'You are a news topic analyzer. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent analysis
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(response.choices[0].message.content);
    const duration = Date.now() - startTime;

    console.log(`[TOPIC_INTELLIGENCE] Analyzed "${topic}" in ${duration}ms: ${analysis.specificity}`);
    console.log(`[TOPIC_INTELLIGENCE] Suggestions:`, analysis.suggestions);
    console.log(`[TOPIC_INTELLIGENCE] Expanded terms:`, analysis.expandedTerms);

    return {
      specificity: analysis.specificity || 'unknown',
      reasoning: analysis.reasoning || '',
      suggestions: analysis.suggestions || [],
      expandedTerms: analysis.expandedTerms || [topic],
      shouldRefine: analysis.shouldRefine || false,
      shouldExpand: analysis.shouldExpand || false
    };

  } catch (error) {
    console.error('[TOPIC_INTELLIGENCE] Error analyzing topic:', error.message);
    
    // Fallback: use simple heuristics
    return fallbackAnalysis(topic, context);
  }
}

/**
 * Fallback analysis using simple heuristics (when GPT is unavailable)
 */
function fallbackAnalysis(topic, context = {}) {
  const topicLower = topic.toLowerCase().trim();
  const { userCountry = 'us' } = context;
  
  // Too broad: single common words
  const broadTopics = ['politics', 'sports', 'business', 'technology', 'tech', 'news', 'entertainment', 'health', 'science', 'world', 'local'];
  
  if (broadTopics.includes(topicLower)) {
    const suggestions = [];
    
    // Add country-specific suggestions for broad topics
    if (topicLower === 'politics') {
      if (userCountry === 'us') {
        suggestions.push('U.S. Politics', 'U.S. Elections', 'Congress', 'White House');
      } else if (userCountry === 'gb') {
        suggestions.push('UK Politics', 'Parliament', 'Prime Minister');
      } else {
        suggestions.push(`${userCountry.toUpperCase()} Politics`, 'Local Politics');
      }
    } else if (topicLower === 'sports') {
      if (userCountry === 'us') {
        suggestions.push('NFL', 'NBA', 'MLB', 'College Football');
      } else {
        suggestions.push('Football', 'Soccer', 'Premier League');
      }
    } else {
      suggestions.push(`${userCountry.toUpperCase()} ${topic}`, `Local ${topic}`);
    }
    
    return {
      specificity: 'too_broad',
      reasoning: 'Single common word, likely too general',
      suggestions,
      expandedTerms: [topic],
      shouldRefine: true,
      shouldExpand: false
    };
  }
  
  // Too specific: very long phrases (>5 words) or highly technical
  const wordCount = topicLower.split(/\s+/).length;
  const technicalKeywords = ['polymerase', 'molecular', 'quantum', 'enzyme', 'peptide', 'chromosome'];
  const isTechnical = technicalKeywords.some(kw => topicLower.includes(kw));
  
  if (wordCount > 5 || (wordCount > 3 && isTechnical)) {
    return {
      specificity: 'too_specific',
      reasoning: 'Very specific/technical topic, may have few articles',
      suggestions: [],
      expandedTerms: [topic],
      shouldRefine: false,
      shouldExpand: true
    };
  }
  
  // Just right
  return {
    specificity: 'just_right',
    reasoning: 'Topic appears balanced',
    suggestions: [],
    expandedTerms: [topic],
    shouldRefine: false,
    shouldExpand: false
  };
}

/**
 * Generate search-optimized query terms for a topic
 * Handles both broad and specific topics
 * 
 * @param {string} topic - The original topic
 * @param {Object} context - User context (country, region, feedback)
 * @returns {Object} { primaryTerms, secondaryTerms, excludeTerms }
 */
async function generateSearchTerms(topic, context = {}) {
  const { userCountry = 'us', likedKeywords = [], dislikedKeywords = [] } = context;
  
  // Get topic analysis
  const analysis = await analyzeTopicSpecificity(topic, context);
  
  const searchTerms = {
    primaryTerms: [],
    secondaryTerms: [],
    excludeTerms: [],
    metadata: {
      specificity: analysis.specificity,
      reasoning: analysis.reasoning
    }
  };
  
  if (analysis.specificity === 'too_broad') {
    // For broad topics: use user's location to refine
    // Primary: Original topic
    searchTerms.primaryTerms = [topic];
    
    // Secondary: Country/region-specific variations
    if (userCountry === 'us') {
      searchTerms.secondaryTerms = [`U.S. ${topic}`, `American ${topic}`];
    } else {
      searchTerms.secondaryTerms = [`${userCountry.toUpperCase()} ${topic}`];
    }
    
    // If user has feedback, use it to filter
    if (dislikedKeywords.length > 0) {
      searchTerms.excludeTerms = dislikedKeywords;
    }
    
  } else if (analysis.specificity === 'too_specific') {
    // For specific topics: expand with related terms
    searchTerms.primaryTerms = [topic];
    searchTerms.secondaryTerms = analysis.expandedTerms.filter(t => t !== topic);
    
  } else {
    // Just right: use as-is with minor variations
    searchTerms.primaryTerms = [topic];
    searchTerms.secondaryTerms = analysis.expandedTerms.filter(t => t !== topic);
  }
  
  // Add liked keywords as boost terms
  if (likedKeywords.length > 0) {
    searchTerms.secondaryTerms.push(...likedKeywords);
  }
  
  return searchTerms;
}

/**
 * Learn from user feedback to refine topics over time
 * Analyzes patterns in liked/disliked articles to suggest topic improvements
 * 
 * @param {string} topic - The topic to analyze
 * @param {Array} likedArticles - Articles user liked for this topic
 * @param {Array} dislikedArticles - Articles user disliked for this topic
 * @returns {Object} { refinedTopic, reasoning, confidence }
 */
async function learnFromFeedback(topic, likedArticles = [], dislikedArticles = []) {
  if (!OPENAI_API_KEY || (likedArticles.length === 0 && dislikedArticles.length === 0)) {
    return {
      refinedTopic: topic,
      reasoning: 'Insufficient feedback data',
      confidence: 0,
      suggestions: []
    };
  }

  // Extract patterns from feedback
  const likedTitles = likedArticles.slice(0, 10).map(a => a.title).join('\n');
  const dislikedTitles = dislikedArticles.slice(0, 10).map(a => a.title).join('\n');

  const prompt = `Analyze user feedback for the topic "${topic}" to suggest improvements:

LIKED ARTICLES:
${likedTitles || 'None'}

DISLIKED ARTICLES:
${dislikedTitles || 'None'}

Based on these patterns:
1. What subtopic is the user REALLY interested in?
2. What should be excluded?
3. Suggest a refined topic name that better captures their interest

Return JSON:
{
  "refinedTopic": "improved topic name",
  "reasoning": "why this refinement",
  "confidence": 0-100,
  "suggestions": ["alternative1", "alternative2"],
  "excludeTerms": ["term1", "term2"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a personalization expert. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    console.log(`[TOPIC_INTELLIGENCE] Learned from feedback for "${topic}":`, result.refinedTopic);
    
    return result;

  } catch (error) {
    console.error('[TOPIC_INTELLIGENCE] Error learning from feedback:', error.message);
    return {
      refinedTopic: topic,
      reasoning: 'Error analyzing feedback',
      confidence: 0,
      suggestions: []
    };
  }
}

/**
 * Batch analyze multiple topics (more efficient for onboarding/setup)
 */
async function analyzeMultipleTopics(topics, context = {}) {
  if (!OPENAI_API_KEY || !topics || topics.length === 0) {
    return topics.map(topic => ({
      topic,
      analysis: fallbackAnalysis(topic, context)
    }));
  }

  const prompt = `Analyze these news topics for specificity:

${topics.map((t, i) => `${i + 1}. "${t}"`).join('\n')}

User context:
- Country: ${context.userCountry || 'us'}

For each topic, determine if it's:
- TOO BROAD (needs refinement)
- TOO SPECIFIC (needs expansion) 
- JUST RIGHT

Return JSON array:
{
  "topics": [
    {
      "topic": "original topic",
      "specificity": "too_broad" | "too_specific" | "just_right",
      "suggestions": ["suggestion1", ...],
      "expandedTerms": ["term1", ...]
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a news topic analyzer. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return result.topics || topics.map(topic => ({
      topic,
      analysis: fallbackAnalysis(topic, context)
    }));

  } catch (error) {
    console.error('[TOPIC_INTELLIGENCE] Error in batch analysis:', error.message);
    return topics.map(topic => ({
      topic,
      analysis: fallbackAnalysis(topic, context)
    }));
  }
}

/**
 * Smart topic suggester: when user types a topic, suggest if it should be refined
 * This can be called in real-time as user types (with debouncing)
 */
async function suggestTopicImprovements(topic, context = {}) {
  const analysis = await analyzeTopicSpecificity(topic, context);
  
  return {
    originalTopic: topic,
    needsImprovement: analysis.shouldRefine || analysis.shouldExpand,
    reason: analysis.reasoning,
    suggestions: analysis.suggestions,
    message: generateUserMessage(analysis)
  };
}

/**
 * Generate user-friendly message about topic quality
 */
function generateUserMessage(analysis) {
  if (analysis.specificity === 'too_broad') {
    return {
      type: 'warning',
      title: 'This topic might be too broad',
      message: 'You might get articles you\'re not interested in. Try one of these more specific topics:',
      suggestions: analysis.suggestions
    };
  } else if (analysis.specificity === 'too_specific') {
    return {
      type: 'info',
      title: 'This topic might be too specific',
      message: 'You might not get many articles. We\'ll automatically search for related topics too.',
      suggestions: []
    };
  }
  
  return {
    type: 'success',
    title: 'Great topic!',
    message: 'This topic has a good balance of specificity.',
    suggestions: []
  };
}

module.exports = {
  analyzeTopicSpecificity,
  generateSearchTerms,
  learnFromFeedback,
  analyzeMultipleTopics,
  suggestTopicImprovements,
  fallbackAnalysis
};
