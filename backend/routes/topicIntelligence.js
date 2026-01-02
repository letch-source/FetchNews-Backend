/**
 * API Routes for Topic Intelligence
 * Helps users create better topics and improves article matching
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const topicIntelligence = require('../services/topicIntelligence');

/**
 * POST /api/topics/analyze
 * Analyze a single topic for specificity
 * Returns suggestions for improvement
 */
router.post('/analyze', authenticateToken, async (req, res) => {
  try {
    const { topic } = req.body;
    const user = req.user;

    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Topic is required'
      });
    }

    const context = {
      userCountry: user.selectedCountry || 'us',
      userRegion: null // Could add this to user model later
    };

    const analysis = await topicIntelligence.suggestTopicImprovements(topic, context);

    res.json({
      success: true,
      ...analysis
    });

  } catch (error) {
    console.error('[TOPIC_INTELLIGENCE_API] Error analyzing topic:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze topic'
    });
  }
});

/**
 * POST /api/topics/analyze-batch
 * Analyze multiple topics at once (useful for onboarding)
 */
router.post('/analyze-batch', authenticateToken, async (req, res) => {
  try {
    const { topics } = req.body;
    const user = req.user;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Topics array is required'
      });
    }

    const context = {
      userCountry: user.selectedCountry || 'us'
    };

    const analyses = await topicIntelligence.analyzeMultipleTopics(topics, context);

    res.json({
      success: true,
      topics: analyses
    });

  } catch (error) {
    console.error('[TOPIC_INTELLIGENCE_API] Error analyzing topics batch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze topics'
    });
  }
});

/**
 * POST /api/topics/learn-from-feedback
 * Analyze user feedback for a topic and suggest refinements
 * This can be called periodically or when user has significant feedback
 */
router.post('/learn-from-feedback', authenticateToken, async (req, res) => {
  try {
    const { topic } = req.body;
    const user = req.user;

    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'Topic is required'
      });
    }

    // Get feedback for this topic
    const topicLower = topic.toLowerCase();
    
    // Filter liked/disliked articles that are relevant to this topic
    // (This is approximate - in production, you'd want to track topic per article)
    const likedArticles = (user.likedArticles || []).slice(0, 20);
    const dislikedArticles = (user.dislikedArticles || []).slice(0, 20);

    const learning = await topicIntelligence.learnFromFeedback(
      topic,
      likedArticles,
      dislikedArticles
    );

    res.json({
      success: true,
      ...learning
    });

  } catch (error) {
    console.error('[TOPIC_INTELLIGENCE_API] Error learning from feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to learn from feedback'
    });
  }
});

/**
 * GET /api/topics/suggestions/:topic
 * Quick endpoint to get suggestions for a topic (can be called as user types)
 */
router.get('/suggestions/:topic', authenticateToken, async (req, res) => {
  try {
    const topic = decodeURIComponent(req.params.topic);
    const user = req.user;

    const context = {
      userCountry: user.selectedCountry || 'us'
    };

    const analysis = await topicIntelligence.analyzeTopicSpecificity(topic, context);

    res.json({
      success: true,
      topic,
      specificity: analysis.specificity,
      suggestions: analysis.suggestions,
      needsImprovement: analysis.shouldRefine || analysis.shouldExpand,
      reasoning: analysis.reasoning
    });

  } catch (error) {
    console.error('[TOPIC_INTELLIGENCE_API] Error getting suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get suggestions'
    });
  }
});

module.exports = router;
