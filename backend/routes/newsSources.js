const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get available news sources
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Return a basic list of news sources
    // This is a placeholder - in a real implementation, this would come from a database or API
    const newsSources = [
      { id: 'bbc-news', name: 'BBC News' },
      { id: 'cnn', name: 'CNN' },
      { id: 'reuters', name: 'Reuters' },
      { id: 'associated-press', name: 'Associated Press' },
      { id: 'the-guardian', name: 'The Guardian' },
      { id: 'washington-post', name: 'Washington Post' },
      { id: 'new-york-times', name: 'New York Times' },
      { id: 'usa-today', name: 'USA Today' },
      { id: 'fox-news', name: 'Fox News' },
      { id: 'nbc-news', name: 'NBC News' }
    ];
    
    res.json({ newsSources });
  } catch (error) {
    console.error('Get news sources error:', error);
    res.status(500).json({ error: 'Failed to get news sources' });
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
    // This is a placeholder - in a real implementation, this would save to database
    user.preferences = user.preferences || {};
    user.preferences.selectedNewsSources = selectedSources;
    
    // Save user (this would be a database operation in real implementation)
    // await user.save();
    
    res.json({ 
      message: 'News sources updated successfully',
      selectedSources: user.preferences.selectedNewsSources 
    });
  } catch (error) {
    console.error('Update news sources error:', error);
    res.status(500).json({ error: 'Failed to update news sources' });
  }
});

module.exports = router;
