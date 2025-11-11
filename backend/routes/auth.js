const express = require('express');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const { generateToken, authenticateToken } = require('../middleware/auth');
const fallbackAuth = require('../utils/fallbackAuth');
const User = require('../models/User');

const router = express.Router();

// Initialize Google OAuth client
// Use iOS Client ID for verification (tokens from iOS are issued for iOS Client ID)
// Fallback to Web Client ID if iOS Client ID not set
const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const webClientId = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(iosClientId);

// Check if database is available
const isDatabaseAvailable = () => {
  return mongoose.connection.readyState === 1;
};

// Google Sign-In endpoint (receives ID token from iOS)
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    // Verify the ID token with Google
    // Try iOS Client ID first (since tokens from iOS are issued for iOS Client ID)
    // Then try Web Client ID as fallback (for tokens from web clients)
    let ticket;
    let verificationError = null;
    
    // Try iOS Client ID first
    if (iosClientId) {
      try {
        ticket = await client.verifyIdToken({
          idToken: idToken,
          audience: iosClientId
        });
      } catch (error) {
        verificationError = error;
        console.log(`[AUTH] Verification with iOS Client ID failed, trying Web Client ID...`);
      }
    }
    
    // If iOS Client ID verification failed, try Web Client ID
    if (!ticket && webClientId && webClientId !== iosClientId) {
      try {
        const webClient = new OAuth2Client(webClientId);
        ticket = await webClient.verifyIdToken({
          idToken: idToken,
          audience: webClientId
        });
      } catch (error) {
        verificationError = error;
        console.error('Google token verification error:', error);
        return res.status(401).json({ error: 'Invalid Google token. Please ensure GOOGLE_IOS_CLIENT_ID is set in backend environment.' });
      }
    }
    
    if (!ticket) {
      console.error('Google token verification failed with both client IDs');
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const payload = ticket.getPayload();
    const { sub: googleId, email, email_verified, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    let user;
    if (isDatabaseAvailable()) {
      // Try to find user by Google ID first
      user = await User.findOne({ googleId });

      if (!user) {
        // Check if user exists by email (for migration - link Google account)
        user = await User.findOne({ email: email.toLowerCase() });
        
        if (user) {
          // Link Google account to existing user (migration scenario)
          if (!user.googleId) {
            user.googleId = googleId;
            if (email_verified) {
              user.emailVerified = true;
            }
            await user.save();
          } else {
            // User has different googleId - this shouldn't happen, but handle gracefully
            return res.status(400).json({ error: 'Email already associated with different Google account' });
          }
        } else {
          // Create new user with Google account
          user = new User({
            email: email.toLowerCase(),
            googleId: googleId,
            emailVerified: email_verified || false
          });
          await user.save();
        }
      } else {
        // Update email verification status if needed
        if (email_verified && !user.emailVerified) {
          user.emailVerified = true;
          await user.save();
        }
      }
    } else {
      // Fallback mode - only create Google-authenticated users
      const existingUser = await fallbackAuth.findUserByGoogleId(googleId);
      if (existingUser) {
        user = existingUser;
      } else {
        user = await fallbackAuth.createGoogleUser(email, googleId);
      }
    }

    // Generate JWT token
    const token = generateToken(user._id);

    // Get user preferences
    let preferences = {};
    if (isDatabaseAvailable()) {
      preferences = user.getPreferences ? user.getPreferences() : {
        selectedVoice: user.selectedVoice || 'alloy',
        playbackRate: user.playbackRate || 1.0,
        upliftingNewsOnly: user.upliftingNewsOnly || false,
        lastFetchedTopics: user.lastFetchedTopics || [],
        selectedTopics: user.selectedTopics || [],
        selectedNewsSources: user.selectedNewsSources || [],
        scheduledSummaries: user.scheduledSummaries || []
      };
      console.log(`[AUTH] User ${user.email} selectedTopics count: ${(preferences.selectedTopics || []).length}`);
    } else {
      preferences = fallbackAuth.getPreferences ? fallbackAuth.getPreferences(user) : {
        selectedVoice: user.selectedVoice || 'alloy',
        playbackRate: user.playbackRate || 1.0,
        upliftingNewsOnly: user.upliftingNewsOnly || false,
        lastFetchedTopics: user.lastFetchedTopics || [],
        selectedTopics: user.selectedTopics || [],
        selectedNewsSources: user.selectedNewsSources || [],
        scheduledSummaries: user.scheduledSummaries || []
      };
    }

    res.json({
      message: 'Authentication successful',
      token,
      user: {
        id: String(user._id || user.id || ''),
        email: user.email,
        emailVerified: user.emailVerified || email_verified || false,
        isPremium: user.isPremium || false,
        dailyUsageCount: user.dailyUsageCount || 0,
        subscriptionId: user.subscriptionId || null,
        subscriptionExpiresAt: user.subscriptionExpiresAt || null,
        customTopics: user.customTopics || [],
        summaryHistory: user.summaryHistory || [],
        selectedTopics: preferences.selectedTopics || [],
        selectedVoice: preferences.selectedVoice || 'alloy',
        playbackRate: preferences.playbackRate || 1.0,
        upliftingNewsOnly: preferences.upliftingNewsOnly || false,
        selectedNewsSources: preferences.selectedNewsSources || []
      }
    });
  } catch (error) {
    console.error('Google authentication error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Provide more specific error messages
    if (error.message && error.message.includes('Google ID is required')) {
      return res.status(400).json({ error: 'Account migration error. Please contact support.' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: `Validation error: ${error.message}` });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Account already exists with this email or Google ID' });
    }
    
    res.status(500).json({ error: 'Authentication failed', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Get user preferences
    let preferences = {};
    if (isDatabaseAvailable()) {
      preferences = user.getPreferences ? user.getPreferences() : {
        selectedVoice: user.selectedVoice || 'alloy',
        playbackRate: user.playbackRate || 1.0,
        upliftingNewsOnly: user.upliftingNewsOnly || false,
        lastFetchedTopics: user.lastFetchedTopics || [],
        selectedTopics: user.selectedTopics || [],
        selectedNewsSources: user.selectedNewsSources || [],
        scheduledSummaries: user.scheduledSummaries || []
      };
    } else {
      preferences = fallbackAuth.getPreferences ? fallbackAuth.getPreferences(user) : {
        selectedVoice: user.selectedVoice || 'alloy',
        playbackRate: user.playbackRate || 1.0,
        upliftingNewsOnly: user.upliftingNewsOnly || false,
        lastFetchedTopics: user.lastFetchedTopics || [],
        selectedTopics: user.selectedTopics || [],
        selectedNewsSources: user.selectedNewsSources || [],
        scheduledSummaries: user.scheduledSummaries || []
      };
    }
    
    res.json({
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified || false,
        isPremium: user.isPremium,
        dailyUsageCount: user.dailyUsageCount,
        subscriptionId: user.subscriptionId,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        customTopics: user.customTopics || [],
        summaryHistory: user.summaryHistory || [],
        selectedTopics: preferences.selectedTopics || [],
        selectedVoice: preferences.selectedVoice || 'alloy',
        playbackRate: preferences.playbackRate || 1.0,
        upliftingNewsOnly: preferences.upliftingNewsOnly || false,
        selectedNewsSources: preferences.selectedNewsSources || []
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

module.exports = router;
