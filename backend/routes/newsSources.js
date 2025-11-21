const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Fallback sources list (used if API fails)
const fallbackSources = [
  { id: 'cnn', name: 'CNN', category: 'general', country: 'us', language: 'en', url: 'https://cnn.com' },
  { id: 'bbc-news', name: 'BBC News', category: 'general', country: 'gb', language: 'en', url: 'https://bbc.com' },
  { id: 'reuters', name: 'Reuters', category: 'general', country: 'us', language: 'en', url: 'https://reuters.com' },
  { id: 'associated-press', name: 'Associated Press', category: 'general', country: 'us', language: 'en', url: 'https://ap.org' },
  { id: 'bloomberg', name: 'Bloomberg', category: 'business', country: 'us', language: 'en', url: 'https://bloomberg.com' },
  { id: 'the-washington-post', name: 'The Washington Post', category: 'general', country: 'us', language: 'en', url: 'https://washingtonpost.com' },
  { id: 'the-new-york-times', name: 'The New York Times', category: 'general', country: 'us', language: 'en', url: 'https://nytimes.com' },
  { id: 'usa-today', name: 'USA Today', category: 'general', country: 'us', language: 'en', url: 'https://usatoday.com' },
  { id: 'npr', name: 'NPR', category: 'general', country: 'us', language: 'en', url: 'https://npr.org' }
];

// Get available news sources
router.get('/', authenticateToken, async (req, res) => {
  try {
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
      const sourcesUrl = `https://api.mediastack.com/v1/sources?access_key=${MEDIASTACK_KEY}`;
      console.log('[NEWS SOURCES] Attempting to fetch sources from Mediastack sources endpoint...');
      
      const response = await fetch(sourcesUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if we got valid data
        if (data && data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
          // Map Mediastack response to our expected format
          const mappedSources = data.sources.map(source => ({
            id: source.id || source.name?.toLowerCase().replace(/\s+/g, '-'),
            name: source.name || source.id,
            category: source.category || 'general',
            country: source.country || 'us',
            language: source.language || 'en',
            url: source.url || ''
          }));
          
          console.log(`[NEWS SOURCES] Successfully fetched ${mappedSources.length} sources from Mediastack sources endpoint`);
          return res.json({ 
            newsSources: mappedSources,
            source: 'mediastack',
            total: mappedSources.length
          });
        }
      }
      
      // If sources endpoint doesn't work, try building list from news API
      console.log('[NEWS SOURCES] Sources endpoint not available, building sources list from news API...');
      const sourcesSet = new Map();
      
      // Fetch news from different categories to discover sources
      const categories = ['general', 'business', 'technology', 'sports', 'entertainment', 'health', 'science'];
      const countries = ['us', 'gb', 'ca', 'au'];
      
      // Sample a few categories and countries to discover sources
      for (const category of categories.slice(0, 3)) {
        for (const country of countries.slice(0, 2)) {
          try {
            const newsUrl = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&categories=${category}&countries=${country}&languages=en&limit=100`;
            const newsResponse = await fetch(newsUrl);
            
            if (newsResponse.ok) {
              const newsData = await newsResponse.json();
              if (newsData && newsData.data && Array.isArray(newsData.data)) {
                newsData.data.forEach(article => {
                  if (article.source) {
                    const sourceId = article.source.toLowerCase().replace(/\s+/g, '-');
                    if (!sourcesSet.has(sourceId)) {
                      sourcesSet.set(sourceId, {
                        id: sourceId,
                        name: article.source,
                        category: category,
                        country: country,
                        language: 'en',
                        url: ''
                      });
                    }
                  }
                });
              }
            }
          } catch (err) {
            // Continue with next category/country if one fails
            console.warn(`[NEWS SOURCES] Failed to fetch sources from ${category}/${country}:`, err.message);
          }
        }
      }
      
      if (sourcesSet.size > 0) {
        const discoveredSources = Array.from(sourcesSet.values());
        console.log(`[NEWS SOURCES] Discovered ${discoveredSources.length} sources from news API`);
        return res.json({ 
          newsSources: discoveredSources,
          source: 'mediastack-discovered',
          total: discoveredSources.length
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
      
      return res.json({ 
        newsSources: fallbackSources,
        source: 'fallback',
        total: fallbackSources.length,
        warning: 'Using fallback sources due to API error'
      });
    }
  } catch (error) {
    console.error('[NEWS SOURCES] Get news sources error:', error);
    // Even if everything fails, return fallback sources
    return res.json({ 
      newsSources: fallbackSources,
      source: 'fallback',
      total: fallbackSources.length,
      error: 'Failed to get news sources from API'
    });
  }
});

// Update user's selected news sources
router.put('/', authenticateToken, async (req, res) => {
  try {
    const { selectedSources } = req.body;
    const user = req.user;
    
    if (!Array.isArray(selectedSources)) {
      return res.status(400).json({ error: 'selectedSources must be an array' });
    }
    
    // Update user preferences with selected sources
    const User = require('../models/User');
    const userDoc = await User.findById(user.id);
    
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update the user's selected news sources
    userDoc.selectedNewsSources = selectedSources;
    await userDoc.save();
    
    res.json({ 
      message: 'News sources updated successfully',
      selectedSources: selectedSources 
    });
  } catch (error) {
    console.error('Update news sources error:', error);
    res.status(500).json({ error: 'Failed to update news sources' });
  }
});

module.exports = router;
