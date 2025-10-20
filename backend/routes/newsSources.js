const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Get available news sources from NewsAPI
router.get('/available', authenticateToken, async (req, res) => {
  try {
    // Check if user is premium
    if (!req.user.isPremium) {
      return res.status(403).json({ 
        error: 'Premium feature', 
        message: 'News source selection is only available for premium users' 
      });
    }

    const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY;
    if (!MEDIASTACK_KEY) {
      return res.status(500).json({ error: 'Mediastack key not configured' });
    }

    // Fetch sources from Mediastack
    const response = await fetch(`http://api.mediastack.com/v1/sources?access_key=${MEDIASTACK_KEY}&languages=en`);

    if (!response.ok) {
      throw new Error(`Mediastack error: ${response.status}`);
    }

    const data = await response.json();
    
    // Group sources by category for better organization
    const sourcesByCategory = {};
    data.sources.forEach(source => {
      const category = source.category || 'general';
      if (!sourcesByCategory[category]) {
        sourcesByCategory[category] = [];
      }
      sourcesByCategory[category].push({
        id: source.id,
        name: source.name,
        description: source.description,
        url: source.url,
        category: source.category,
        language: source.language,
        country: source.country
      });
    });

    res.json({
      sources: data.sources,
      sourcesByCategory
    });
  } catch (error) {
    console.error('Error fetching news sources:', error);
    res.status(500).json({ error: 'Failed to fetch news sources' });
  }
});

// Get user's selected news sources
router.get('/selected', authenticateToken, async (req, res) => {
  try {
    // Check if user is premium
    if (!req.user.isPremium) {
      return res.status(403).json({ 
        error: 'Premium feature', 
        message: 'News source selection is only available for premium users' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const preferences = user.getPreferences();
    res.json({ selectedSources: preferences.selectedNewsSources || [] });
  } catch (error) {
    console.error('Error fetching selected news sources:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user's selected news sources
router.put('/selected', authenticateToken, async (req, res) => {
  try {
    // Check if user is premium
    if (!req.user.isPremium) {
      return res.status(403).json({ 
        error: 'Premium feature', 
        message: 'News source selection is only available for premium users' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { selectedSources } = req.body;
    
    // Validate input
    if (!Array.isArray(selectedSources)) {
      return res.status(400).json({ error: 'selectedSources must be an array' });
    }

    // Limit to reasonable number of sources (max 20)
    if (selectedSources.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 news sources allowed' });
    }

    // Validate source IDs (basic validation - should be strings)
    for (const sourceId of selectedSources) {
      if (typeof sourceId !== 'string' || sourceId.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid source ID format' });
      }
    }

    // Update user preferences
    const preferences = await user.updatePreferences({
      selectedNewsSources: selectedSources
    });

    res.json({ 
      message: 'News sources updated successfully',
      selectedSources: preferences.selectedNewsSources 
    });
  } catch (error) {
    console.error('Error updating selected news sources:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
