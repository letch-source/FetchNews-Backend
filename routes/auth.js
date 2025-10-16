const express = require('express');
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user
    const user = new User({ email, password });
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        isPremium: user.isPremium,
        dailyUsageCount: user.dailyUsageCount
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        isPremium: user.isPremium,
        dailyUsageCount: user.dailyUsageCount
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    res.json({
      user: {
        id: user._id,
        email: user.email,
        isPremium: user.isPremium,
        dailyUsageCount: user.dailyUsageCount,
        subscriptionId: user.subscriptionId,
        subscriptionExpiresAt: user.subscriptionExpiresAt
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update subscription status
router.post('/subscription', authenticateToken, async (req, res) => {
  try {
    const { isPremium, subscriptionId, expiresAt } = req.body;
    const user = req.user;

    await user.updateSubscription(isPremium, subscriptionId, expiresAt);

    res.json({
      message: 'Subscription updated successfully',
      user: {
        id: user._id,
        email: user.email,
        isPremium: user.isPremium,
        subscriptionId: user.subscriptionId,
        subscriptionExpiresAt: user.subscriptionExpiresAt
      }
    });
  } catch (error) {
    console.error('Subscription update error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Get usage status
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const usageCheck = user.canFetchNews();

    res.json({
      userId: user._id,
      isPremium: user.isPremium,
      dailyCount: user.dailyUsageCount,
      dailyLimit: 1,
      canFetch: usageCheck.allowed,
      reason: usageCheck.reason
    });
  } catch (error) {
    console.error('Usage check error:', error);
    res.status(500).json({ error: 'Failed to check usage' });
  }
});

module.exports = router;
