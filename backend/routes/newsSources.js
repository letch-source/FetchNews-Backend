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
    
    // Fetch sources from Mediastack API
    const url = `http://api.mediastack.com/v1/sources?access_key=${MEDIASTACK_KEY}&languages=en&limit=100`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Mediastack API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response from Mediastack API');
    }
    
    // Map Mediastack sources to our format
    const newsSources = data.data.map(source => ({
      id: source.id,
      name: source.name,
      category: source.category,
      country: source.country,
      language: source.language,
      url: source.url
    }));
    
    res.json({ newsSources });
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
