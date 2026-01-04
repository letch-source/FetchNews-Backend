const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');

/**
 * Get recommended topics for a user based on their preferences and behavior
 * Returns 3-5 topic suggestions with full summaries and audio
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Lazy require to avoid circular dependencies
    const { generateTTS } = require('../index');
    const { getMultipleTopicSummaries } = require('../services/topicSummaryService');
    const { fetchArticlesFromCache } = require('../services/cachedArticleFetcher');
    
    console.log(`[RECOMMENDED] Generating recommendations for user ${user.email}`);
    
    // Get user preferences
    const preferences = user.getPreferences ? user.getPreferences() : {};
    const wordCount = parseInt(preferences.length || '200', 10);
    const goodNewsOnly = preferences.upliftingNewsOnly || false;
    const location = user.location || '';
    const selectedVoice = user.selectedVoice || 'alloy';
    const playbackRate = user.playbackRate || 1.0;
    const userCountry = preferences.selectedCountry || 'us';
    
    // Get user's selected topics to exclude them from recommendations
    const selectedTopics = new Set((preferences.selectedTopics || []).map(t => t.toLowerCase()));
    
    // Get recommended topics
    const recommendedTopics = await generateRecommendedTopics(user, selectedTopics);
    
    if (recommendedTopics.length === 0) {
      console.log(`[RECOMMENDED] No recommendations generated for user ${user.email}`);
      return res.json({ topicSections: [] });
    }
    
    console.log(`[RECOMMENDED] Generated ${recommendedTopics.length} recommendations: ${recommendedTopics.join(', ')}`);
    
    // Get cached summaries for all recommended topics
    console.log(`[RECOMMENDED] Fetching cached summaries for ${recommendedTopics.length} topics`);
    const topicResults = await getMultipleTopicSummaries(recommendedTopics, {
      wordCount,
      country: userCountry,
      goodNewsOnly,
      excludedSources: preferences.excludedNewsSources || []
    });
    
    // Build topic sections with audio
    const topicSections = [];
    
    for (const result of topicResults) {
      try {
        if (!result.summary || result.articleCount === 0) {
          console.log(`[RECOMMENDED] Skipping topic ${result.topic} - no summary or articles`);
          continue;
        }
        
        console.log(`[RECOMMENDED] Processing topic: ${result.topic} (${result.fromCache ? 'cached' : 'generated'})`);
        
        // Fetch articles for display
        let articles = [];
        try {
          const { articles: cachedArticles } = await fetchArticlesFromCache(result.topic, null, 5, preferences.excludedNewsSources || []);
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
          console.warn(`[RECOMMENDED] Could not fetch articles for ${result.topic}:`, fetchErr.message);
        }
        
        // Generate TTS audio for the summary
        let audioUrl = null;
        try {
          const audioData = await generateTTS(result.summary, selectedVoice, playbackRate);
          audioUrl = audioData.audioUrl;
          console.log(`[RECOMMENDED] Generated audio for topic: ${result.topic}`);
        } catch (audioErr) {
          console.error(`[RECOMMENDED] Failed to generate audio for topic ${result.topic}:`, audioErr);
        }
        
        // Add to topic sections
        topicSections.push({
          id: `recommended-${result.topic}-${Date.now()}`,
          topic: result.topic,
          summary: result.summary,
          audioUrl: audioUrl,
          articles: articles,
          metadata: result.metadata || {}
        });
        
        console.log(`[RECOMMENDED] Successfully processed topic: ${result.topic} (${articles.length} articles)`);
        
      } catch (topicErr) {
        console.error(`[RECOMMENDED] Error processing topic ${result.topic}:`, topicErr);
        // Continue with other topics even if one fails
      }
    }
    
    console.log(`[RECOMMENDED] Completed. Returning ${topicSections.length} topic sections`);
    
    res.json({ topicSections });
    
  } catch (error) {
    console.error('[RECOMMENDED] Error generating recommendations:', error);
    res.status(500).json({ 
      error: 'Failed to generate recommendations',
      topicSections: [] 
    });
  }
});

/**
 * Generate recommended topics based on user behavior and trends
 * @param {Object} user - The user object
 * @param {Set} excludeTopics - Topics to exclude (user's selected topics)
 * @returns {Array<string>} - Array of recommended topic names
 */
async function generateRecommendedTopics(user, excludeTopics = new Set()) {
  const recommendations = [];
  
  // 1. Get trending topics (global trends)
  const GlobalSettings = require('../models/GlobalSettings');
  const globalSettings = await GlobalSettings.getOrCreate();
  const trendingTopics = globalSettings.trendingTopics || [];
  
  console.log(`[RECOMMENDED] Available trending topics: ${trendingTopics.length}`);
  
  // 2. Analyze user's liked articles to find topic patterns
  const userInterests = analyzeUserInterests(user);
  console.log(`[RECOMMENDED] User interests: ${JSON.stringify(userInterests)}`);
  
  // 3. Build recommendation pool
  const candidateTopics = new Map(); // topic -> score
  
  // Add trending topics (base score: 1.0)
  trendingTopics.forEach(topic => {
    const topicLower = topic.toLowerCase();
    if (!excludeTopics.has(topicLower)) {
      candidateTopics.set(topic, 1.0);
    }
  });
  
  // Boost topics related to user interests
  for (const [interest, strength] of Object.entries(userInterests)) {
    // Check if any candidate topics match this interest
    for (const [topic, score] of candidateTopics.entries()) {
      if (topic.toLowerCase().includes(interest) || interest.includes(topic.toLowerCase())) {
        candidateTopics.set(topic, score + strength);
      }
    }
    
    // Also consider adding the interest itself as a topic
    if (!excludeTopics.has(interest) && strength > 0.3) {
      const capitalizedInterest = interest.charAt(0).toUpperCase() + interest.slice(1);
      if (!candidateTopics.has(capitalizedInterest)) {
        candidateTopics.set(capitalizedInterest, strength);
      }
    }
  }
  
  // If we have very few candidates, add some popular defaults
  if (candidateTopics.size < 5) {
    const defaultTopics = ['AI & Technology', 'Climate Change', 'Space Exploration', 'Global Economy', 'Innovation'];
    defaultTopics.forEach(topic => {
      if (!excludeTopics.has(topic.toLowerCase()) && !candidateTopics.has(topic)) {
        candidateTopics.set(topic, 0.5);
      }
    });
  }
  
  // Sort by score and take top 3-5
  const sortedTopics = Array.from(candidateTopics.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);
  
  console.log(`[RECOMMENDED] Final recommendations (${sortedTopics.length}): ${sortedTopics.join(', ')}`);
  
  return sortedTopics;
}

/**
 * Analyze user's behavior to identify interests
 * @param {Object} user - The user object
 * @returns {Object} - Map of interest keywords to strength (0-1)
 */
function analyzeUserInterests(user) {
  const interests = {};
  
  // Analyze liked articles
  const likedArticles = user.likedArticles || [];
  const likedSources = new Set();
  const likedTopics = new Map(); // topic -> count
  
  likedArticles.forEach(article => {
    // Track sources
    if (article.source) {
      likedSources.add(article.source.toLowerCase());
    }
    
    // Extract keywords from titles
    if (article.title) {
      const keywords = extractKeywordsFromText(article.title);
      keywords.forEach(keyword => {
        interests[keyword] = (interests[keyword] || 0) + 0.2;
      });
    }
  });
  
  // Analyze topic preferences (if available)
  if (user.topicPreferences) {
    for (const [topic, pref] of user.topicPreferences.entries()) {
      if (pref.likeCount > pref.dislikeCount) {
        interests[topic] = (interests[topic] || 0) + 0.3;
      }
    }
  }
  
  // Normalize scores to 0-1 range
  const maxScore = Math.max(...Object.values(interests), 1);
  for (const key in interests) {
    interests[key] = Math.min(interests[key] / maxScore, 1);
  }
  
  return interests;
}

/**
 * Extract meaningful keywords from text
 * @param {string} text - Input text
 * @returns {Array<string>} - Array of keywords
 */
function extractKeywordsFromText(text) {
  if (!text) return [];
  
  // Common stop words to ignore
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
  
  // Return unique words
  return [...new Set(words)];
}

/**
 * GET /api/recommended-topics/names
 * Returns just the names of recommended topics (lightweight)
 * Used for showing recommended topics after user views their summaries
 */
router.get('/names', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    console.log(`[RECOMMENDED_NAMES] Getting topic names for user ${user.email}`);
    
    // Get user preferences
    const preferences = user.getPreferences ? user.getPreferences() : {};
    
    // Get user's selected topics to exclude them from recommendations
    const selectedTopics = new Set((preferences.selectedTopics || []).map(t => t.toLowerCase()));
    
    // Generate recommended topics based on selected topics and user behavior
    const recommendedTopicNames = await generateRecommendedTopicNames(user, selectedTopics);
    
    console.log(`[RECOMMENDED_NAMES] Returning ${recommendedTopicNames.length} recommendations: ${recommendedTopicNames.join(', ')}`);
    
    res.json({ 
      recommendedTopics: recommendedTopicNames,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[RECOMMENDED_NAMES] Error generating recommendations:', error);
    res.status(500).json({ 
      error: 'Failed to generate recommendations',
      recommendedTopics: []
    });
  }
});

/**
 * Generate recommended topic names based on user's selected topics
 * This is a lightweight version that returns topic names only (no summaries/audio)
 * @param {Object} user - The user object
 * @param {Set} excludeTopics - Topics to exclude (user's selected topics)
 * @returns {Array<string>} - Array of recommended topic names
 */
async function generateRecommendedTopicNames(user, excludeTopics = new Set()) {
  const recommendations = [];
  
  // Get user preferences
  const preferences = user.getPreferences ? user.getPreferences() : {};
  const selectedTopics = preferences.selectedTopics || [];
  
  // Define topic relationships - topics that are related to each other
  const topicRelationships = {
    'technology': ['AI & Machine Learning', 'Cybersecurity', 'Software Development', 'Tech Startups', 'Gadgets & Hardware'],
    'ai': ['Technology', 'Robotics', 'Automation', 'Machine Learning', 'Ethics in AI'],
    'artificial intelligence': ['Technology', 'Robotics', 'Machine Learning', 'AI Ethics', 'Future of Work'],
    'sports': ['NFL', 'NBA', 'MLB', 'Soccer', 'Tennis', 'Olympics'],
    'nfl': ['Sports', 'Football', 'Super Bowl', 'College Football'],
    'nba': ['Sports', 'Basketball', 'March Madness', 'College Basketball'],
    'politics': ['U.S. Politics', 'Elections', 'Congress', 'White House', 'International Relations'],
    'business': ['Finance', 'Stock Market', 'Entrepreneurship', 'Economics', 'Corporate News'],
    'finance': ['Business', 'Stock Market', 'Cryptocurrency', 'Banking', 'Personal Finance'],
    'health': ['Medical Research', 'Mental Health', 'Fitness', 'Nutrition', 'Healthcare Policy'],
    'science': ['Space Exploration', 'Climate Change', 'Physics', 'Biology', 'Medical Research'],
    'entertainment': ['Movies', 'Music', 'TV Shows', 'Celebrities', 'Gaming'],
    'climate change': ['Environment', 'Renewable Energy', 'Sustainability', 'Green Technology'],
    'space': ['NASA', 'SpaceX', 'Astronomy', 'Space Exploration', 'Planetary Science'],
    'cryptocurrency': ['Bitcoin', 'Ethereum', 'Blockchain', 'DeFi', 'NFTs'],
    'environment': ['Climate Change', 'Conservation', 'Wildlife', 'Renewable Energy'],
    'education': ['Higher Education', 'Online Learning', 'EdTech', 'Student Debt'],
    'gaming': ['Video Games', 'Esports', 'Game Development', 'Gaming Industry'],
    'food': ['Restaurants', 'Recipes', 'Food Industry', 'Nutrition', 'Cooking'],
    'travel': ['Tourism', 'Airlines', 'Hotels', 'Destinations', 'Travel Tips'],
    'music': ['Concerts', 'New Releases', 'Music Industry', 'Artists', 'Streaming'],
    'movies': ['Box Office', 'Film Industry', 'Movie Reviews', 'Streaming Services'],
  };
  
  // Get trending topics
  const GlobalSettings = require('../models/GlobalSettings');
  const globalSettings = await GlobalSettings.getOrCreate();
  const trendingTopics = globalSettings.trendingTopics || [];
  
  // Build candidate topics based on user's selected topics
  const candidateTopics = new Map(); // topic -> score
  
  // For each selected topic, add related topics
  selectedTopics.forEach(selectedTopic => {
    const topicLower = selectedTopic.toLowerCase();
    
    // Check if we have predefined relationships for this topic
    if (topicRelationships[topicLower]) {
      topicRelationships[topicLower].forEach(relatedTopic => {
        const relatedLower = relatedTopic.toLowerCase();
        if (!excludeTopics.has(relatedLower)) {
          // Higher score for directly related topics
          candidateTopics.set(relatedTopic, (candidateTopics.get(relatedTopic) || 0) + 2.0);
        }
      });
    }
    
    // Also check reverse relationships (if a topic is mentioned in another's relationships)
    for (const [key, relatedList] of Object.entries(topicRelationships)) {
      if (relatedList.some(r => r.toLowerCase() === topicLower)) {
        // Add the parent topic as a recommendation
        const parentTopic = key.charAt(0).toUpperCase() + key.slice(1);
        if (!excludeTopics.has(key)) {
          candidateTopics.set(parentTopic, (candidateTopics.get(parentTopic) || 0) + 1.5);
        }
      }
    }
  });
  
  // Add trending topics with lower score if they're not already in candidates
  trendingTopics.forEach(topic => {
    const topicLower = topic.toLowerCase();
    if (!excludeTopics.has(topicLower) && !candidateTopics.has(topic)) {
      candidateTopics.set(topic, 0.5);
    }
  });
  
  // Analyze user's liked articles to boost relevant topics
  const userInterests = analyzeUserInterests(user);
  for (const [interest, strength] of Object.entries(userInterests)) {
    for (const [topic, score] of candidateTopics.entries()) {
      if (topic.toLowerCase().includes(interest) || interest.includes(topic.toLowerCase())) {
        candidateTopics.set(topic, score + (strength * 0.5));
      }
    }
  }
  
  // If we have very few candidates, add some popular defaults
  if (candidateTopics.size < 5) {
    const defaultTopics = ['Technology', 'Science', 'World News', 'Business', 'Entertainment'];
    defaultTopics.forEach(topic => {
      if (!excludeTopics.has(topic.toLowerCase()) && !candidateTopics.has(topic)) {
        candidateTopics.set(topic, 0.3);
      }
    });
  }
  
  // Sort by score and take top 5-8 recommendations
  const sortedTopics = Array.from(candidateTopics.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic]) => topic);
  
  console.log(`[RECOMMENDED_NAMES] Generated ${sortedTopics.length} recommendations from ${selectedTopics.length} selected topics`);
  
  return sortedTopics;
}

module.exports = router;
