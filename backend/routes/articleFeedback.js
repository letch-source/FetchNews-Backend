const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const User = require('../models/User');

const router = express.Router();

// Submit article feedback (thumbs up or thumbs down)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { articleId, url, title, source, feedback } = req.body; // feedback: 'like' or 'dislike'
    
    if (!articleId || !feedback || !['like', 'dislike'].includes(feedback)) {
      return res.status(400).json({ error: 'Invalid request. articleId and feedback (like/dislike) are required.' });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove from opposite list if exists
    if (feedback === 'like') {
      // Remove from dislikedArticles if present
      user.dislikedArticles = user.dislikedArticles.filter(
        article => article.articleId !== articleId && article.url !== url
      );
      
      // Add to likedArticles if not already present
      const alreadyLiked = user.likedArticles.some(
        article => article.articleId === articleId || article.url === url
      );
      
      if (!alreadyLiked) {
        user.likedArticles.push({
          articleId,
          url: url || '',
          title: title || '',
          source: source || '',
          timestamp: new Date()
        });
        
        // Keep only last 1000 liked articles to prevent database bloat
        if (user.likedArticles.length > 1000) {
          user.likedArticles = user.likedArticles.slice(-1000);
        }
      }
    } else { // dislike
      // Remove from likedArticles if present
      user.likedArticles = user.likedArticles.filter(
        article => article.articleId !== articleId && article.url !== url
      );
      
      // Add to dislikedArticles if not already present
      const alreadyDisliked = user.dislikedArticles.some(
        article => article.articleId === articleId || article.url === url
      );
      
      if (!alreadyDisliked) {
        user.dislikedArticles.push({
          articleId,
          url: url || '',
          title: title || '',
          source: source || '',
          timestamp: new Date()
        });
        
        // Keep only last 1000 disliked articles to prevent database bloat
        if (user.dislikedArticles.length > 1000) {
          user.dislikedArticles = user.dislikedArticles.slice(-1000);
        }
      }
    }
    
    await user.save();
    
    res.json({ 
      message: `Article ${feedback === 'like' ? 'liked' : 'disliked'} successfully`,
      likedCount: user.likedArticles.length,
      dislikedCount: user.dislikedArticles.length
    });
  } catch (error) {
    console.error('Article feedback error:', error);
    res.status(500).json({ error: 'Failed to submit article feedback' });
  }
});

// Submit article feedback with comment and topic (for topic-level feedback)
router.post('/with-comment', authenticateToken, async (req, res) => {
  try {
    const { articleId, url, title, source, topic, feedback, comment } = req.body;
    
    if (!articleId || !feedback || !['like', 'dislike'].includes(feedback)) {
      return res.status(400).json({ error: 'Invalid request. articleId and feedback (like/dislike) are required.' });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Create feedback entry with optional comment and topic
    const feedbackEntry = {
      articleId,
      url: url || '',
      title: title || '',
      source: source || '',
      topic: topic || '',
      comment: comment || '',
      timestamp: new Date()
    };
    
    // Remove from opposite list if exists
    if (feedback === 'like') {
      user.dislikedArticles = user.dislikedArticles.filter(
        article => article.articleId !== articleId && article.url !== url
      );
      
      const alreadyLiked = user.likedArticles.some(
        article => article.articleId === articleId || article.url === url
      );
      
      if (!alreadyLiked) {
        user.likedArticles.push(feedbackEntry);
        
        if (user.likedArticles.length > 1000) {
          user.likedArticles = user.likedArticles.slice(-1000);
        }
      }
    } else { // dislike
      user.likedArticles = user.likedArticles.filter(
        article => article.articleId !== articleId && article.url !== url
      );
      
      const alreadyDisliked = user.dislikedArticles.some(
        article => article.articleId === articleId || article.url === url
      );
      
      if (!alreadyDisliked) {
        user.dislikedArticles.push(feedbackEntry);
        
        if (user.dislikedArticles.length > 1000) {
          user.dislikedArticles = user.dislikedArticles.slice(-1000);
        }
      }
    }
    
    await user.save();
    
    console.log(`✅ Feedback with comment: ${feedback} for article "${title}" in topic "${topic}"`);
    if (comment) {
      console.log(`   Comment: ${comment.substring(0, 100)}${comment.length > 100 ? '...' : ''}`);
    }
    
    res.json({ 
      message: `Article ${feedback === 'like' ? 'liked' : 'disliked'} successfully`,
      likedCount: user.likedArticles.length,
      dislikedCount: user.dislikedArticles.length
    });
  } catch (error) {
    console.error('Article feedback with comment error:', error);
    res.status(500).json({ error: 'Failed to submit article feedback' });
  }
});

// Get user's article feedback (for debugging/admin purposes)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      likedArticles: user.likedArticles || [],
      dislikedArticles: user.dislikedArticles || []
    });
  } catch (error) {
    console.error('Get article feedback error:', error);
    res.status(500).json({ error: 'Failed to get article feedback' });
  }
});

module.exports = router;


