const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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
    
    // Note: Mediastack sources API has validation issues (422 error)
    // Using fallback sources for reliability
    console.log(`[NEWS SOURCES] Using fallback sources (Mediastack sources API has validation issues)`);
    
    // Fallback: return a basic list of common news sources
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
      
      console.log(`[NEWS SOURCES] Using fallback sources (${fallbackSources.length} sources):`);
      fallbackSources.forEach((source, index) => {
        console.log(`[NEWS SOURCES] ${index + 1}. ${source.name} (${source.id}) - ${source.category} - ${source.country}`);
      });
      
      return res.json({ newsSources: fallbackSources });
  } catch (error) {
    console.error('Get news sources error:', error);
    res.status(500).json({ 
      error: 'Failed to get news sources',
      details: error.message 
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
