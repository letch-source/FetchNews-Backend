const express = require('express');
const mongoose = require('mongoose');
const { generateToken, authenticateToken } = require('../middleware/auth');
const fallbackAuth = require('../utils/fallbackAuth');
const User = require('../models/User'); // Import once at top

const router = express.Router();

// Check if database is available
const isDatabaseAvailable = () => {
  return mongoose.connection.readyState === 1;
};

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

    let user;
    if (isDatabaseAvailable()) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Create new user
      user = new User({ email, password });
      await user.save();
    } else {
      // Use fallback authentication
      const existingUser = await fallbackAuth.findUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      user = await fallbackAuth.createUser(email, password);
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        isPremium: user.isPremium,
        dailyUsageCount: user.dailyUsageCount,
        subscriptionId: user.subscriptionId,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        customTopics: user.customTopics || [],
        summaryHistory: user.summaryHistory || []
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

    let user, isMatch;
    if (isDatabaseAvailable()) {
      // User is already imported at top
      
      // Find user
      user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check password
      isMatch = await user.comparePassword(password);
    } else {
      // Use fallback authentication
      user = await fallbackAuth.findUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check password
      isMatch = await fallbackAuth.comparePassword(user, password);
    }

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
        dailyUsageCount: user.dailyUsageCount,
        subscriptionId: user.subscriptionId,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        customTopics: user.customTopics || [],
        summaryHistory: user.summaryHistory || []
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
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        customTopics: user.customTopics || [],
        summaryHistory: user.summaryHistory || []
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

    if (isDatabaseAvailable()) {
      await user.updateSubscription(isPremium, subscriptionId, expiresAt);
    } else {
      await fallbackAuth.updateSubscription(user, isPremium, subscriptionId, expiresAt);
    }

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
    let usageCheck;
    
    if (isDatabaseAvailable()) {
      usageCheck = user.canFetchNews();
    } else {
      usageCheck = fallbackAuth.canFetchNews(user);
    }

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

// Admin endpoint to manually set premium status (for testing)
router.post('/admin/set-premium', async (req, res) => {
  try {
    const { email, isPremium } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    let user;
    if (isDatabaseAvailable()) {
      // User is already imported at top
      user = await User.findOne({ email });
      if (user) {
        await user.updateSubscription(isPremium, 'admin-test', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days
      }
    } else {
      user = await fallbackAuth.findUserByEmail(email);
      if (user) {
        await fallbackAuth.updateSubscription(user, isPremium, 'admin-test', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      }
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      message: `User ${isPremium ? 'upgraded to' : 'downgraded from'} premium`,
      user: {
        id: user._id,
        email: user.email,
        isPremium: user.isPremium
      }
    });
  } catch (error) {
    console.error('Admin premium update error:', error);
    res.status(500).json({ error: 'Failed to update premium status' });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    let user;
    if (isDatabaseAvailable()) {
      // User is already imported at top
      user = await User.findOne({ email });
    } else {
      // For fallback auth, we'll simulate the process
      user = await fallbackAuth.findUserByEmail(email);
    }

    // Always return success to prevent email enumeration
    res.json({ 
      message: 'If an account with that email exists, a password reset link has been sent.' 
    });

    // Only proceed if user exists
    if (!user) {
      return;
    }

    // Generate reset token
    let resetToken;
    if (isDatabaseAvailable()) {
      resetToken = user.generatePasswordResetToken();
      await user.save();
    } else {
      // For fallback, generate a simple token
      resetToken = require('crypto').randomBytes(32).toString('hex');
    }

    // In a real app, you would send an email here
    // For now, we'll just log the reset link
    const resetUrl = `${process.env.FRONTEND_ORIGIN || 'https://your-app.com'}/reset-password?token=${resetToken}`;
    console.log(`Password reset link for ${email}: ${resetUrl}`);
    
    // TODO: Send email with reset link
    // await sendPasswordResetEmail(email, resetUrl);

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    let user;
    if (isDatabaseAvailable()) {
      // User is already imported at top
      const crypto = require('crypto');
      
      // Hash the token to compare with stored hash
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      // Update password and clear reset token
      user.password = newPassword;
      await user.clearPasswordResetToken();

    } else {
      // For fallback auth, we'll simulate the process
      // In a real implementation, you'd need to store tokens somewhere
      return res.status(400).json({ error: 'Password reset not available in fallback mode' });
    }

    res.json({ message: 'Password has been reset successfully' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Register device token for push notifications
router.post('/device-token', authenticateToken, async (req, res) => {
  try {
    const { deviceToken, platform } = req.body;
    const user = req.user;

    if (!deviceToken || !platform) {
      return res.status(400).json({ error: 'Device token and platform are required' });
    }

    if (isDatabaseAvailable()) {
      // Remove existing token for this device/platform (update if exists)
      user.deviceTokens = user.deviceTokens || [];
      user.deviceTokens = user.deviceTokens.filter(
        dt => !(dt.token === deviceToken && dt.platform === platform)
      );
      
      // Add new token
      user.deviceTokens.push({
        token: deviceToken,
        platform: platform,
        createdAt: new Date()
      });
      
      user.markModified('deviceTokens');
      await user.save();
    } else {
      // Fallback: store in JSON (simplified)
      console.log(`[AUTH] Device token registration (fallback): ${deviceToken.substring(0, 20)}... for ${user.email}`);
    }

    res.json({ message: 'Device token registered successfully' });
  } catch (error) {
    console.error('Device token registration error:', error);
    res.status(500).json({ error: 'Failed to register device token' });
  }
});

module.exports = router;
