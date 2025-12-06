const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Cache for sources list (refresh every 24 hours)
let sourcesCache = null;
let sourcesCacheTimestamp = null;
const SOURCES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
    
    const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY;
    
    if (!MEDIASTACK_KEY) {
      return res.status(503).json({ 
        error: 'News sources not available',
        message: 'Mediastack API key not configured'
      });
    }
    
    // Try to fetch sources from Mediastack API
    // Note: Mediastack may not have a dedicated /sources endpoint
    // We'll try the endpoint, and if it fails, build sources list from news API responses
    try {
      // First, try the sources endpoint (if it exists)
      // Try with different query parameters to get all sources
      const sourcesUrls = [
        `https://api.mediastack.com/v1/sources?access_key=${MEDIASTACK_KEY}`,
        `https://api.mediastack.com/v1/sources?access_key=${MEDIASTACK_KEY}&limit=10000`,
        `https://api.mediastack.com/v1/sources?access_key=${MEDIASTACK_KEY}&languages=en`
      ];
      
      console.log('[NEWS SOURCES] Attempting to fetch sources from Mediastack sources endpoint...');
      
      for (const sourcesUrl of sourcesUrls) {
        try {
          const response = await fetch(sourcesUrl);
          
          if (response.ok) {
            const data = await response.json();
            
            // Check if we got valid data (could be in 'sources' or 'data' field)
            const sourcesArray = data?.sources || data?.data || [];
            
            if (Array.isArray(sourcesArray) && sourcesArray.length > 0) {
              // Map Mediastack response to our expected format
              const mappedSources = sourcesArray.map(source => ({
                id: source.id || source.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                name: source.name || source.id,
                description: source.description || `${source.name || source.id} - ${source.category || 'general'} news source`,
                category: source.category || 'general',
                country: source.country || 'us',
                language: source.language || 'en',
                url: source.url || ''
              }));
              
              console.log(`[NEWS SOURCES] Successfully fetched ${mappedSources.length} sources from Mediastack sources endpoint`);
              
              // If we got a good number of sources (more than 100), use it and cache it
              if (mappedSources.length > 100) {
                // Cache the results (cache all sources, filter per user)
                sourcesCache = mappedSources;
                sourcesCacheTimestamp = Date.now();
                
                // Filter by user's country
                const filteredSources = mappedSources.filter(source => 
                  source.country && source.country.toLowerCase() === userCountry.toLowerCase()
                );
                
                return res.json({ 
                  newsSources: filteredSources,
                  source: 'mediastack',
                  total: filteredSources.length,
                  filteredByCountry: userCountry
                });
              } else {
                console.log(`[NEWS SOURCES] Only got ${mappedSources.length} sources from endpoint, trying next URL or discovery method...`);
              }
            }
          } else {
            // Only log non-validation errors (validation errors are expected - sources endpoint may not work)
            if (response.status !== 422) {
              const errorText = await response.text().catch(() => '');
              console.log(`[NEWS SOURCES] Sources endpoint returned ${response.status}: ${errorText.substring(0, 200)}`);
            }
            // 422 validation errors are expected - Mediastack sources endpoint may require different parameters
          }
        } catch (err) {
          console.warn(`[NEWS SOURCES] Error fetching from sources endpoint:`, err.message);
        }
      }
      
      // If sources endpoint doesn't work, try building comprehensive list from news API
      console.log('[NEWS SOURCES] Sources endpoint not available, building comprehensive sources list from news API...');
      const sourcesSet = new Map();
      
      // Fetch from ALL categories and MANY countries to discover all sources
      const categories = ['general', 'business', 'technology', 'sports', 'entertainment', 'health', 'science'];
      // Expanded country list to cover more sources
      const countries = [
        'us', 'gb', 'ca', 'au', 'de', 'fr', 'it', 'es', 'nl', 'be', 
        'se', 'no', 'dk', 'fi', 'pl', 'cz', 'at', 'ch', 'ie', 'pt',
        'gr', 'jp', 'cn', 'in', 'kr', 'sg', 'my', 'th', 'ph', 'id',
        'nz', 'za', 'mx', 'br', 'ar', 'cl', 'co', 'pe', 'ae', 'sa',
        'il', 'tr', 'eg', 'ng', 'ke', 'ma', 'ru', 'ua', 'pk', 'bd'
      ];
      
      console.log(`[NEWS SOURCES] Fetching from ${categories.length} categories and ${countries.length} countries...`);
      
      // Fetch from all categories and countries (with rate limiting)
      let requestCount = 0;
      const maxRequests = 100; // Limit to avoid hitting API limits
      
      for (const category of categories) {
        for (const country of countries) {
          if (requestCount >= maxRequests) {
            console.log(`[NEWS SOURCES] Reached max requests limit (${maxRequests}), stopping discovery`);
            break;
          }
          
          try {
            // Fetch with higher limit to get more sources
            const newsUrl = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&categories=${category}&countries=${country}&languages=en&limit=100&sort=published_desc`;
            const newsResponse = await fetch(newsUrl);
            
            if (newsResponse.ok) {
              const newsData = await newsResponse.json();
              if (newsData && newsData.data && Array.isArray(newsData.data)) {
                newsData.data.forEach(article => {
                  if (article.source) {
                    const sourceId = article.source.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                    if (!sourcesSet.has(sourceId)) {
                    sourcesSet.set(sourceId, {
                      id: sourceId,
                      name: article.source,
                      description: `${article.source} - ${category} news source`,
                      category: category,
                      country: country,
                      language: 'en',
                      url: article.url ? new URL(article.url).origin : ''
                    });
                    } else {
                      // Update existing source with additional category/country info if needed
                      const existing = sourcesSet.get(sourceId);
                      // Keep the first category/country found, but could enhance this
                    }
                  }
                });
              }
            }
            requestCount++;
            
            // Small delay to avoid rate limiting
            if (requestCount % 10 === 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (err) {
            // Continue with next category/country if one fails
            console.warn(`[NEWS SOURCES] Failed to fetch sources from ${category}/${country}:`, err.message);
            requestCount++;
          }
          
          if (requestCount >= maxRequests) break;
        }
        if (requestCount >= maxRequests) break;
      }
      
      if (sourcesSet.size > 0) {
        const discoveredSources = Array.from(sourcesSet.values());
        console.log(`[NEWS SOURCES] Discovered ${discoveredSources.length} sources from news API`);
        
        // Cache the results (cache all sources, filter per user)
        sourcesCache = discoveredSources;
        sourcesCacheTimestamp = Date.now();
        
        // Filter by user's country
        const filteredSources = discoveredSources.filter(source => 
          source.country && source.country.toLowerCase() === userCountry.toLowerCase()
        );
        
        return res.json({ 
          newsSources: filteredSources,
          source: 'mediastack-discovered',
          total: filteredSources.length,
          filteredByCountry: userCountry
        });
      } else {
        throw new Error('Could not discover sources from news API');
      }
    } catch (apiError) {
      // If API call fails, use fallback sources
      console.warn(`[NEWS SOURCES] Failed to fetch from Mediastack API: ${apiError.message}`);
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
