const express = require('express');
const mongoose = require('mongoose');
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
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Check and reset dailyUsageCount if needed (resets at midnight PST)
    let dailyUsageCount = 0;
    if (isDatabaseAvailable()) {
      // Call canFetchNews to reset count if it's a new day
      user.canFetchNews();
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

module.exports = router;
