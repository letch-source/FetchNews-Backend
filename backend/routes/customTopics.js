const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

// Get user's custom topics
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    let customTopics;
    
    if (mongoose.connection.readyState === 1) {
      customTopics = user.getCustomTopics();
    } else {
      customTopics = fallbackAuth.getCustomTopics(user);
    }
    
    res.json({ customTopics });
  } catch (error) {
    console.error('Get custom topics error:', error);
    res.status(500).json({ error: 'Failed to get custom topics' });
  }
});

// Add a custom topic
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { topic } = req.body;
    const user = req.user;
    
    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return res.status(400).json({ error: 'Topic is required and must be a non-empty string' });
    }
    
    const trimmedTopic = topic.trim();
    
    // Validate topic length
    if (trimmedTopic.length > 50) {
      return res.status(400).json({ error: 'Topic must be 50 characters or less' });
    }
    
    let customTopics;
    if (mongoose.connection.readyState === 1) {
      customTopics = await user.addCustomTopic(trimmedTopic);
    } else {
      customTopics = await fallbackAuth.addCustomTopic(user, trimmedTopic);
    }
    
    res.json({ 
      message: 'Custom topic added successfully',
      customTopics 
    });
  } catch (error) {
    console.error('Add custom topic error:', error);
    res.status(500).json({ error: 'Failed to add custom topic' });
  }
});

// Remove a custom topic
router.delete('/:topic', authenticateToken, async (req, res) => {
  try {
    const { topic } = req.params;
    const user = req.user;
    
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }
    
    let customTopics;
    if (mongoose.connection.readyState === 1) {
      customTopics = await user.removeCustomTopic(topic);
    } else {
      customTopics = await fallbackAuth.removeCustomTopic(user, topic);
    }
    
    res.json({ 
      message: 'Custom topic removed successfully',
      customTopics 
    });
  } catch (error) {
    console.error('Remove custom topic error:', error);
    res.status(500).json({ error: 'Failed to remove custom topic' });
  }
});

// Update all custom topics (replace entire list)
router.put('/', authenticateToken, async (req, res) => {
  try {
    const { customTopics } = req.body;
    const user = req.user;
    
    if (!Array.isArray(customTopics)) {
      return res.status(400).json({ error: 'Custom topics must be an array' });
    }
    
    // Validate each topic
    for (const topic of customTopics) {
      if (typeof topic !== 'string' || topic.trim().length === 0) {
        return res.status(400).json({ error: 'All topics must be non-empty strings' });
      }
      if (topic.trim().length > 50) {
        return res.status(400).json({ error: 'All topics must be 50 characters or less' });
      }
    }
    
    // Trim and deduplicate topics
    const trimmedTopics = [...new Set(customTopics.map(t => t.trim()))];
    
    if (mongoose.connection.readyState === 1) {
      user.customTopics = trimmedTopics;
      await user.save();
    } else {
      user.customTopics = trimmedTopics;
    }
    
    res.json({ 
      message: 'Custom topics updated successfully',
      customTopics: trimmedTopics 
    });
  } catch (error) {
    console.error('Update custom topics error:', error);
    res.status(500).json({ error: 'Failed to update custom topics' });
  }
});

module.exports = router;
