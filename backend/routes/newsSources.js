const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Cache for sources list (refresh every 24 hours)
let sourcesCache = null;
let sourcesCacheTimestamp = null;
const SOURCES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Function to fetch all US sources from Mediastack
async function fetchAllUSSources() {
  const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY;
  
  if (!MEDIASTACK_KEY) {
    console.log('[NEWS SOURCES] ⚠️  Mediastack API key not configured, skipping source fetch');
    console.log('[NEWS SOURCES] Using fallback sources list instead');
    printSources(fallbackSources.filter(s => s.country === 'us'));
    return [];
  }
  
  console.log('[NEWS SOURCES] 🔍 Fetching all US sources from Mediastack...');
  console.log(`[NEWS SOURCES] API Key present: ${MEDIASTACK_KEY ? 'Yes' : 'No'} (length: ${MEDIASTACK_KEY?.length || 0})`);
  
  // Try the /v1/sources endpoint first
  let allSources = [];
  let sourcesEndpointWorked = false;
  
  try {
    // Try with minimal parameters first
    const testUrl = `https://api.mediastack.com/v1/sources?access_key=${MEDIASTACK_KEY}&countries=us`;
    console.log(`[NEWS SOURCES] Testing sources endpoint: ${testUrl.replace(MEDIASTACK_KEY, '***')}`);
    const testResponse = await fetch(testUrl);
    
    if (testResponse.ok) {
      const testData = await testResponse.json();
      const sourcesArray = testData?.data || testData?.sources || [];
      
      if (Array.isArray(sourcesArray) && sourcesArray.length > 0) {
        console.log(`[NEWS SOURCES] ✅ Sources endpoint works! Found ${sourcesArray.length} sources`);
        sourcesEndpointWorked = true;
        
        // Now fetch all pages
        let offset = 0;
        const limit = 100;
        let hasMore = true;
        
        while (hasMore) {
          try {
            const sourcesUrl = `https://api.mediastack.com/v1/sources?access_key=${MEDIASTACK_KEY}&countries=us&limit=${limit}&offset=${offset}`;
            const response = await fetch(sourcesUrl);
            
            if (response.ok) {
              const responseData = await response.json();
              const pageSources = responseData?.data || responseData?.sources || [];
              const pagination = responseData?.pagination;
              
              if (Array.isArray(pageSources) && pageSources.length > 0) {
                const mappedSources = pageSources.map(source => ({
                  id: source.id || source.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                  name: source.name || source.id,
                  description: source.description || `${source.name || source.id} - ${source.category || 'general'} news source`,
                  category: source.category || 'general',
                  country: source.country || 'us',
                  language: source.language || 'en',
                  url: source.url || ''
                }));
                
                allSources = allSources.concat(mappedSources);
                
                if (pagination) {
                  const total = pagination.total || 0;
                  const count = pagination.count || pageSources.length;
                  const currentOffset = pagination.offset || offset;
                  
                  if (allSources.length >= total || pageSources.length < limit) {
                    hasMore = false;
                  } else {
                    offset = currentOffset + count;
                  }
                } else {
                  if (pageSources.length < limit) {
                    hasMore = false;
                  } else {
                    offset += limit;
                  }
                }
                
                if (allSources.length >= 2000) {
                  console.log(`[NEWS SOURCES] ⚠️  Reached safety limit of 2000 sources`);
                  hasMore = false;
                }
              } else {
                hasMore = false;
              }
            } else {
              const errorText = await response.text().catch(() => '');
              console.log(`[NEWS SOURCES] ⚠️  Pagination request failed: ${response.status}: ${errorText.substring(0, 200)}`);
              hasMore = false;
            }
          } catch (err) {
            console.warn(`[NEWS SOURCES] ⚠️  Error fetching page:`, err.message);
            hasMore = false;
          }
          
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
    } else {
      const errorText = await testResponse.text().catch(() => '');
      console.log(`[NEWS SOURCES] ⚠️  Sources endpoint returned ${testResponse.status}: ${errorText.substring(0, 300)}`);
      console.log(`[NEWS SOURCES] ℹ️  The /v1/sources endpoint may not be available on your Mediastack plan`);
      console.log(`[NEWS SOURCES] ℹ️  This endpoint may require a paid plan or different API access`);
    }
  } catch (error) {
    console.error('[NEWS SOURCES] ❌ Error testing sources endpoint:', error.message);
  }
  
  // If sources endpoint didn't work, use fallback sources
  if (!sourcesEndpointWorked || allSources.length === 0) {
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
    
    const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY;
    
    if (!MEDIASTACK_KEY) {
      return res.status(503).json({ 
        error: 'News sources not available',
        message: 'Mediastack API key not configured'
      });
    }
    
    // Fetch all US sources from Mediastack sources endpoint
    try {
      console.log(`[NEWS SOURCES] Fetching all US sources from Mediastack sources endpoint...`);
      
      let allSources = [];
      let offset = 0;
      const limit = 100; // Mediastack default limit per page
      let hasMore = true;
      
      // Fetch all pages of US sources
      while (hasMore) {
        try {
          const sourcesUrl = `https://api.mediastack.com/v1/sources?access_key=${MEDIASTACK_KEY}&countries=${userCountry}&limit=${limit}&offset=${offset}`;
          const response = await fetch(sourcesUrl);
          
          if (response.ok) {
            const data = await response.json();
            
            // Check if we got valid data (could be in 'sources' or 'data' field)
            const sourcesArray = data?.sources || data?.data || [];
            const pagination = data?.pagination;
            
            if (Array.isArray(sourcesArray) && sourcesArray.length > 0) {
              // Map Mediastack response to our expected format
              const mappedSources = sourcesArray.map(source => ({
                id: source.id || source.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                name: source.name || source.id,
                description: source.description || `${source.name || source.id} - ${source.category || 'general'} news source`,
                category: source.category || 'general',
                country: source.country || userCountry,
                language: source.language || 'en',
                url: source.url || ''
              }));
              
              allSources = allSources.concat(mappedSources);
              
              console.log(`[NEWS SOURCES] Fetched ${mappedSources.length} sources (total so far: ${allSources.length})`);
              
              // Check if there are more pages
              if (pagination) {
                const total = pagination.total || 0;
                const count = pagination.count || 0;
                const currentOffset = pagination.offset || offset;
                
                // If we've fetched all sources or got fewer than the limit, we're done
                if (allSources.length >= total || sourcesArray.length < limit) {
                  hasMore = false;
                } else {
                  offset = currentOffset + count;
                }
              } else {
                // No pagination info, stop if we got fewer than limit
                if (sourcesArray.length < limit) {
                  hasMore = false;
                } else {
                  offset += limit;
                }
              }
              
              // Safety limit: don't fetch more than 2000 sources
              if (allSources.length >= 2000) {
                console.log(`[NEWS SOURCES] Reached safety limit of 2000 sources, stopping pagination`);
                hasMore = false;
              }
            } else {
              // No more sources
              hasMore = false;
            }
          } else {
            // API error, try to get error message
            const errorText = await response.text().catch(() => '');
            console.log(`[NEWS SOURCES] Sources endpoint returned ${response.status}: ${errorText.substring(0, 200)}`);
            hasMore = false;
          }
        } catch (err) {
          console.warn(`[NEWS SOURCES] Error fetching sources page at offset ${offset}:`, err.message);
          hasMore = false;
        }
        
        // Small delay between requests to avoid rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      if (allSources.length > 0) {
        console.log(`[NEWS SOURCES] Successfully fetched ${allSources.length} US sources from Mediastack sources endpoint`);
        
        // Cache the results (cache all sources, filter per user)
        sourcesCache = allSources;
        sourcesCacheTimestamp = Date.now();
        
        // Filter by user's country (should already be filtered, but double-check)
        const filteredSources = allSources.filter(source => 
          source.country && source.country.toLowerCase() === userCountry.toLowerCase()
        );
        
        return res.json({ 
          newsSources: filteredSources,
          source: 'mediastack',
          total: filteredSources.length,
          filteredByCountry: userCountry
        });
      } else {
        console.log(`[NEWS SOURCES] No sources found from sources endpoint, trying discovery method...`);
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
module.exports.fetchAllUSSources = fetchAllUSSources;
