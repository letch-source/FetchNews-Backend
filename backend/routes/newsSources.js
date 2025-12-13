const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Cache for sources list (refresh every 24 hours)
let sourcesCache = null;
let sourcesCacheTimestamp = null;
const SOURCES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Function to fetch all US sources from NewsAPI
async function fetchAllUSSources() {
  const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
  
  if (!NEWSAPI_KEY) {
    console.log('[NEWS SOURCES] ⚠️  NewsAPI key not configured, skipping source fetch');
    console.log('[NEWS SOURCES] Using fallback sources list instead');
    printSources(fallbackSources.filter(s => s.country === 'us'));
    return [];
  }
  
  console.log('[NEWS SOURCES] 🔍 Fetching all US sources from NewsAPI...');
  console.log(`[NEWS SOURCES] API Key present: ${NEWSAPI_KEY ? 'Yes' : 'No'} (length: ${NEWSAPI_KEY?.length || 0})`);
  
  let allSources = [];
  
  try {
    // NewsAPI /v2/sources endpoint
    console.log(`[NEWS SOURCES] Fetching sources from NewsAPI...`);
    const url = `https://newsapi.org/v2/sources?country=us`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NEWSAPI_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const sourcesArray = data?.sources || [];
      
      if (Array.isArray(sourcesArray) && sourcesArray.length > 0) {
        console.log(`[NEWS SOURCES] ✅ Sources endpoint works! Found ${sourcesArray.length} sources`);
        
        // Map NewsAPI response to our expected format
        const mappedSources = sourcesArray.map(source => ({
          id: source.id || source.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          name: source.name || source.id,
          description: source.description || `${source.name || source.id} - ${source.category || 'general'} news source`,
          category: source.category || 'general',
          country: source.country || 'us',
          language: source.language || 'en',
          url: source.url || ''
        }));
        
        allSources = mappedSources;
        console.log(`[NEWS SOURCES] ✅ Successfully fetched ${allSources.length} US sources from NewsAPI`);
      } else {
        console.log(`[NEWS SOURCES] ⚠️  No sources found in response`);
      }
    } else {
      const errorText = await response.text().catch(() => '');
      console.log(`[NEWS SOURCES] ⚠️  Sources endpoint returned ${response.status}: ${errorText.substring(0, 300)}`);
    }
  } catch (error) {
    console.error('[NEWS SOURCES] ❌ Error fetching sources:', error.message);
  }
  
  // If sources endpoint didn't work, use fallback sources
  if (allSources.length === 0) {
    console.log(`[NEWS SOURCES] ⚠️  Could not fetch from API, using fallback sources list`);
    allSources = fallbackSources.filter(s => s.country === 'us');
  }
  
  // Cache the results
  if (allSources.length > 0) {
    sourcesCache = allSources;
    sourcesCacheTimestamp = Date.now();
  }
  
  // Print sources
  printSources(allSources);
  
  return allSources;
}

// Helper function to print sources
function printSources(sources) {
  console.log(`[NEWS SOURCES] ✅ Displaying ${sources.length} US sources`);
  console.log('\n📰 All US News Sources:');
  console.log('='.repeat(80));
  
  if (sources.length === 0) {
    console.log('\n   No sources available\n');
    console.log('='.repeat(80));
    return;
  }
  
  // Group by category for better readability
  const sourcesByCategory = {};
  sources.forEach(source => {
    const category = source.category || 'general';
    if (!sourcesByCategory[category]) {
      sourcesByCategory[category] = [];
    }
    sourcesByCategory[category].push(source);
  });
  
  // Print sources grouped by category
  Object.keys(sourcesByCategory).sort().forEach(category => {
    const categorySources = sourcesByCategory[category];
    console.log(`\n📂 ${category.toUpperCase()} (${categorySources.length} sources):`);
    categorySources.forEach((source, index) => {
      console.log(`   ${index + 1}. ${source.name} (${source.id})${source.url ? ` - ${source.url}` : ''}`);
    });
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`📊 Total: ${sources.length} US sources available\n`);
}

// Export function for use on startup
module.exports.fetchAllUSSources = fetchAllUSSources;

// Fallback sources list (used if API fails)
const fallbackSources = [
  { id: 'cnn', name: 'CNN', description: 'CNN - Breaking news and top stories', category: 'general', country: 'us', language: 'en', url: 'https://cnn.com' },
  { id: 'bbc-news', name: 'BBC News', description: 'BBC News - Trusted news from the British Broadcasting Corporation', category: 'general', country: 'gb', language: 'en', url: 'https://bbc.com' },
  { id: 'reuters', name: 'Reuters', description: 'Reuters - International news and analysis', category: 'general', country: 'us', language: 'en', url: 'https://reuters.com' },
  { id: 'associated-press', name: 'Associated Press', description: 'Associated Press - Independent news organization', category: 'general', country: 'us', language: 'en', url: 'https://ap.org' },
  { id: 'bloomberg', name: 'Bloomberg', description: 'Bloomberg - Business and financial news', category: 'business', country: 'us', language: 'en', url: 'https://bloomberg.com' },
  { id: 'the-washington-post', name: 'The Washington Post', description: 'The Washington Post - National and international news', category: 'general', country: 'us', language: 'en', url: 'https://washingtonpost.com' },
  { id: 'the-new-york-times', name: 'The New York Times', description: 'The New York Times - All the news that\'s fit to print', category: 'general', country: 'us', language: 'en', url: 'https://nytimes.com' },
  { id: 'usa-today', name: 'USA Today', description: 'USA Today - National news and information', category: 'general', country: 'us', language: 'en', url: 'https://usatoday.com' },
  { id: 'npr', name: 'NPR', description: 'NPR - National Public Radio news and stories', category: 'general', country: 'us', language: 'en', url: 'https://npr.org' }
];

// Get available news sources
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get user's country preference
    const User = require('../models/User');
    const userId = req.user._id || req.user.id;
    const userDoc = await User.findById(userId);
    const userCountry = (userDoc?.selectedCountry || 'us').toLowerCase();
    
    // Check cache first
    const now = Date.now();
    if (sourcesCache && sourcesCacheTimestamp && (now - sourcesCacheTimestamp) < SOURCES_CACHE_TTL) {
      console.log(`[NEWS SOURCES] Returning ${sourcesCache.length} cached sources, filtering by country: ${userCountry}`);
      // Filter cached sources by user's country
      const filteredSources = sourcesCache.filter(source => 
        source.country && source.country.toLowerCase() === userCountry.toLowerCase()
      );
      return res.json({
        newsSources: filteredSources,
        source: 'cached',
        total: filteredSources.length,
        cached: true,
        filteredByCountry: userCountry
      });
    }
    
    const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
    
    if (!NEWSAPI_KEY) {
      return res.status(503).json({ 
        error: 'News sources not available',
        message: 'NewsAPI key not configured'
      });
    }
    
    // Fetch all sources from NewsAPI sources endpoint
    try {
      console.log(`[NEWS SOURCES] Fetching all sources from NewsAPI sources endpoint...`);
      
      const sourcesUrl = `https://newsapi.org/v2/sources?country=${userCountry}`;
      const response = await fetch(sourcesUrl, {
        headers: {
          'Authorization': `Bearer ${NEWSAPI_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const sourcesArray = data?.sources || [];
        
        if (Array.isArray(sourcesArray) && sourcesArray.length > 0) {
          // Map NewsAPI response to our expected format
          const mappedSources = sourcesArray.map(source => ({
            id: source.id || source.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            name: source.name || source.id,
            description: source.description || `${source.name || source.id} - ${source.category || 'general'} news source`,
            category: source.category || 'general',
            country: source.country || userCountry,
            language: source.language || 'en',
            url: source.url || ''
          }));
          
          console.log(`[NEWS SOURCES] Successfully fetched ${mappedSources.length} sources from NewsAPI sources endpoint`);
          
          // Cache the results (cache all sources, filter per user)
          sourcesCache = mappedSources;
          sourcesCacheTimestamp = Date.now();
          
          // Filter by user's country (should already be filtered, but double-check)
          const filteredSources = mappedSources.filter(source => 
            source.country && source.country.toLowerCase() === userCountry.toLowerCase()
          );
          
          return res.json({ 
            newsSources: filteredSources,
            source: 'newsapi',
            total: filteredSources.length,
            filteredByCountry: userCountry
          });
        } else {
          throw new Error('No sources found in NewsAPI response');
        }
      } else {
        const errorText = await response.text().catch(() => '');
        throw new Error(`NewsAPI error: ${response.status} ${errorText.substring(0, 200)}`);
      }
    } catch (apiError) {
      // If API call fails, use fallback sources
      console.warn(`[NEWS SOURCES] Failed to fetch from NewsAPI: ${apiError.message}`);
      console.log(`[NEWS SOURCES] Using fallback sources (${fallbackSources.length} sources):`);
      fallbackSources.forEach((source, index) => {
        console.log(`[NEWS SOURCES] ${index + 1}. ${source.name} (${source.id}) - ${source.category} - ${source.country}`);
      });
      
      // Filter fallback sources by user's country
      const filteredFallbackSources = fallbackSources.filter(source => 
        source.country && source.country.toLowerCase() === userCountry.toLowerCase()
      );
      
      return res.json({ 
        newsSources: filteredFallbackSources,
        source: 'fallback',
        total: filteredFallbackSources.length,
        warning: 'Using fallback sources due to API error',
        filteredByCountry: userCountry
      });
    }
  } catch (error) {
    console.error('[NEWS SOURCES] Get news sources error:', error);
    // Even if everything fails, return fallback sources filtered by country
    try {
      const User = require('../models/User');
      const userId = req.user?._id || req.user?.id;
      let userCountry = 'us';
      if (userId) {
        const userDoc = await User.findById(userId);
        userCountry = (userDoc?.selectedCountry || 'us').toLowerCase();
      }
      const filteredFallbackSources = fallbackSources.filter(source => 
        source.country && source.country.toLowerCase() === userCountry
      );
      return res.json({ 
        newsSources: filteredFallbackSources,
        source: 'fallback',
        total: filteredFallbackSources.length,
        error: 'Failed to get news sources from API',
        filteredByCountry: userCountry
      });
    } catch (fallbackError) {
      // If we can't get user country, return all fallback sources
      return res.json({ 
        newsSources: fallbackSources,
        source: 'fallback',
        total: fallbackSources.length,
        error: 'Failed to get news sources from API'
      });
    }
  }
});

// Update user's excluded news sources (blocklist approach)
router.put('/', authenticateToken, async (req, res) => {
  try {
    // Support both old and new field names for migration
    const excludedSources = req.body.excludedSources || req.body.selectedSources;
    const user = req.user;
    
    if (!Array.isArray(excludedSources)) {
      return res.status(400).json({ error: 'excludedSources must be an array' });
    }
    
    // Update user preferences with excluded sources
    const User = require('../models/User');
    const userDoc = await User.findById(user.id);
    
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update the user's excluded news sources
    userDoc.excludedNewsSources = excludedSources;
    await userDoc.save();
    
    res.json({ 
      message: 'Excluded news sources updated successfully',
      excludedSources: excludedSources 
    });
  } catch (error) {
    console.error('Update excluded news sources error:', error);
    res.status(500).json({ error: 'Failed to update excluded news sources' });
  }
});

module.exports = router;
module.exports.fetchAllUSSources = fetchAllUSSources;
