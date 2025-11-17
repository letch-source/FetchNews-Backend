const express = require('express');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const { generateToken, authenticateToken } = require('../middleware/auth');
const fallbackAuth = require('../utils/fallbackAuth');
const User = require('../models/User'); // Import once at top
const { 
  sendPasswordResetEmail, 
  sendVerificationEmail, 
  isValidEmail, 
  isDisposableEmail 
} = require('../utils/emailService');

const router = express.Router();

// Initialize Google OAuth client
// Use web client ID if available, otherwise use iOS client ID
const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_IOS_CLIENT_ID;
const client = new OAuth2Client(clientId);

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
    // Support both iOS and Web client IDs (they should be from the same OAuth project)
    const webClientId = process.env.GOOGLE_CLIENT_ID;
    const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID;
    
    if (!webClientId && !iosClientId) {
      console.error('Google OAuth configuration error: GOOGLE_CLIENT_ID or GOOGLE_IOS_CLIENT_ID must be set');
      return res.status(500).json({ error: 'Server configuration error: Google OAuth not configured' });
    }
    
    // Log which client IDs are available (for debugging, without exposing full values)
    if (process.env.NODE_ENV === 'development') {
      console.log('Google OAuth client IDs configured:', {
        webClientId: webClientId ? `${webClientId.substring(0, 20)}...` : 'not set',
        iosClientId: iosClientId ? `${iosClientId.substring(0, 20)}...` : 'not set'
      });
    }

    let ticket;
    let lastError;
    
    // Try web client ID first (recommended for server-side verification)
    if (webClientId) {
      try {
        ticket = await client.verifyIdToken({
          idToken: idToken,
          audience: webClientId
        });
      } catch (error) {
        lastError = error;
        console.log('Token verification with web client ID failed, trying iOS client ID...');
      }
    }
    
    // If web client ID failed and iOS client ID is available, try that
    if (!ticket && iosClientId) {
      try {
        ticket = await client.verifyIdToken({
          idToken: idToken,
          audience: iosClientId
        });
      } catch (error) {
        lastError = error;
        console.error('Google token verification error:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          name: error.name
        });
      }
    }
    
    if (!ticket) {
      console.error('Google token verification failed with all client IDs');
      console.error('Last error:', lastError);
      return res.status(401).json({ 
        error: 'Invalid Google token',
        details: process.env.NODE_ENV === 'development' ? lastError?.message : undefined
      });
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

    // Check and reset dailyUsageCount if needed (resets at midnight PST)
    let dailyUsageCount = 0;
    if (isDatabaseAvailable()) {
      // Call canFetchNews to reset count if it's a new day (now async)
      await user.canFetchNews();
      // Reload user to get updated dailyUsageCount (in case it was reset)
      await user.save();
      dailyUsageCount = user.dailyUsageCount || 0;
    } else {
      // Use fallback auth's canFetchNews to reset count if needed
      fallbackAuth.canFetchNews(user);
      // Save the updated user (fallbackAuth modifies in place)
      await fallbackAuth.saveUser(user);
      dailyUsageCount = user.dailyUsageCount || 0;
    }

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
      message: 'Authentication successful',
      token,
      user: {
        id: String(user._id || user.id || ''),
        email: user.email,
        emailVerified: user.emailVerified || email_verified || false,
        isPremium: user.isPremium || false,
        dailyUsageCount: dailyUsageCount,
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

// Register new user - DISABLED: Google-only authentication required
router.post('/register', async (req, res) => {
  return res.status(403).json({ 
    error: 'Email/password registration is disabled. Please sign in with Google.' 
  });
  
  // Original code kept for reference but disabled
  /*
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check for disposable email
    if (isDisposableEmail(email)) {
      return res.status(400).json({ error: 'Disposable email addresses are not allowed' });
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

      // Generate email verification token
      const verificationToken = user.generateEmailVerificationToken();
      await user.save();

      // Send verification email
      const verificationUrl = `${process.env.FRONTEND_ORIGIN || 'https://your-app.com'}/verify-email?token=${verificationToken}`;
      const emailResult = await sendVerificationEmail(email, verificationUrl);
      
      if (!emailResult.success) {
        console.error('Failed to send verification email:', emailResult.error);
        // Continue registration even if email fails
      }
    } else {
      // Use fallback authentication
      const existingUser = await fallbackAuth.findUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      user = await fallbackAuth.createUser(email, password);
      // Note: Email verification not supported in fallback mode
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User created successfully. Please check your email to verify your account.',
      token,
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified || false,
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
  */
});

// Login user - DISABLED: Google-only authentication required
router.post('/login', async (req, res) => {
  return res.status(403).json({ 
    error: 'Email/password login is disabled. Please sign in with Google.' 
  });
  
  // Original code kept for reference but disabled
  /*
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
        emailVerified: user.emailVerified || false,
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
  */
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Check and reset dailyUsageCount if needed (resets at midnight PST)
    let dailyUsageCount = 0;
    if (isDatabaseAvailable()) {
      // Call canFetchNews to reset count if it's a new day (now async)
      await user.canFetchNews();
      // Reload user to get updated dailyUsageCount (in case it was reset)
      await user.save();
      dailyUsageCount = user.dailyUsageCount || 0;
    } else {
      // Use fallback auth's canFetchNews to reset count if needed
      fallbackAuth.canFetchNews(user);
      // Save the updated user (fallbackAuth modifies in place)
      await fallbackAuth.saveUser(user);
      dailyUsageCount = user.dailyUsageCount || 0;
    }

    // Get user preferences (same logic as Google auth endpoint)
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
        dailyUsageCount: dailyUsageCount,
        subscriptionId: user.subscriptionId,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        customTopics: user.customTopics || [],
        summaryHistory: user.summaryHistory || [],
        selectedTopics: preferences.selectedTopics || []
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
      usageCheck = await user.canFetchNews();
    } else {
      usageCheck = fallbackAuth.canFetchNews(user);
    }

    res.json({
      userId: user._id,
      isPremium: user.isPremium,
      dailyCount: usageCheck.dailyCount || user.dailyUsageCount || 0,
      dailyLimit: usageCheck.limit || (user.isPremium ? 20 : 3),
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

      // Send password reset email
      const resetUrl = `${process.env.FRONTEND_ORIGIN || 'https://your-app.com'}/reset-password?token=${resetToken}`;
      const emailResult = await sendPasswordResetEmail(email, resetUrl);
      
      if (!emailResult.success) {
        console.error('Failed to send password reset email:', emailResult.error);
      } else {
        console.log(`Password reset email sent to ${email}`);
      }
    } else {
      // For fallback, generate a simple token
      resetToken = require('crypto').randomBytes(32).toString('hex');
      const resetUrl = `${process.env.FRONTEND_ORIGIN || 'https://your-app.com'}/reset-password?token=${resetToken}`;
      console.log(`Password reset link for ${email}: ${resetUrl}`);
      console.log('Note: Email sending not supported in fallback mode');
    }

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

// Verify email with token
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    if (!isDatabaseAvailable()) {
      return res.status(400).json({ error: 'Email verification not available in fallback mode' });
    }

    const crypto = require('crypto');
    
    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Verify the email
    await user.verifyEmail();

    res.json({ 
      message: 'Email verified successfully',
      user: {
        id: user._id,
        email: user.email,
        emailVerified: true
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// Resend verification email
router.post('/resend-verification', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (!isDatabaseAvailable()) {
      return res.status(400).json({ error: 'Email verification not available in fallback mode' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate new verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_ORIGIN || 'https://your-app.com'}/verify-email?token=${verificationToken}`;
    const emailResult = await sendVerificationEmail(user.email, verificationUrl);
    
    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error);
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    res.json({ message: 'Verification email sent successfully' });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// Disconnect Google account access
router.post('/disconnect-google', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user.googleId) {
      return res.status(400).json({ error: 'Account is not linked to Google' });
    }

    if (isDatabaseAvailable()) {
      // Remove Google ID from user account
      user.googleId = undefined;
      await user.save();
    } else {
      // Use fallback authentication
      const fallbackAuth = require('../utils/fallbackAuth');
      user.googleId = undefined;
      await fallbackAuth.saveUser(user);
    }

    res.json({ 
      message: 'Google account access has been removed. You will need to sign in with Google again to access your account.',
      user: {
        id: user._id,
        email: user.email,
        googleId: null
      }
    });
  } catch (error) {
    console.error('Disconnect Google error:', error);
    res.status(500).json({ error: 'Failed to disconnect Google account' });
  }
});

module.exports = router;
