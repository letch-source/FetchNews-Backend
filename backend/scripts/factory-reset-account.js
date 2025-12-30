#!/usr/bin/env node

/**
 * Script to factory reset a user account
 * Resets all user data to defaults while keeping the account (email, googleId, subscription)
 * 
 * Usage: node scripts/factory-reset-account.js <email>
 * Example: node scripts/factory-reset-account.js finlaysmith@gmail.com
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const User = require('../models/User');

// Suppress mongoose deprecation warnings for this script
mongoose.set('strictQuery', false);

async function factoryResetAccount(email) {
  try {
    if (!email) {
      console.error('❌ Error: Email address is required');
      console.log('Usage: node scripts/factory-reset-account.js <email>');
      process.exit(1);
    }

    console.log('Connecting to database...');
    await connectDB();
    
    // Wait a moment for connection to establish
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Failed to connect to database. Please check your MONGODB_URI.');
      process.exit(1);
    }
    
    console.log(`\n🔍 Looking for account: ${email}`);
    
    // Find the user by email (case-insensitive)
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      console.error(`❌ Account not found: ${email}`);
      process.exit(1);
    }
    
    console.log(`\n✅ Found account:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Google ID: ${user.googleId}`);
    console.log(`   Premium: ${user.isPremium}`);
    console.log(`   Subscription ID: ${user.subscriptionId || 'None'}`);
    console.log(`   Created: ${user.createdAt}`);
    
    // Show what will be reset
    console.log(`\n📊 Current data:`);
    console.log(`   Daily usage count: ${user.dailyUsageCount}`);
    console.log(`   Custom topics: ${user.customTopics.length} topics`);
    console.log(`   Summary history: ${user.summaryHistory?.length || 0} summaries`);
    console.log(`   Scheduled summaries: ${user.scheduledSummaries?.length || 0} schedules`);
    console.log(`   Selected topics: ${user.selectedTopics?.length || 0} topics`);
    console.log(`   Selected news sources: ${user.selectedNewsSources?.length || 0} sources`);
    
    // Confirm reset
    console.log(`\n⚠️  WARNING: This will reset all user data to defaults.`);
    console.log(`   The following will be RESET:`);
    console.log(`   - Daily usage count → 0`);
    console.log(`   - Custom topics → []`);
    console.log(`   - Summary history → []`);
    console.log(`   - Scheduled summaries → []`);
    console.log(`   - Selected topics → []`);
    console.log(`   - Selected news sources → []`);
    console.log(`   - Last fetched topics → []`);
    console.log(`   - Preferences → defaults (voice: 'alloy', playbackRate: 1.0, upliftingNewsOnly: false)`);
    console.log(`\n   The following will be KEPT:`);
    console.log(`   - Email address`);
    console.log(`   - Google ID`);
    console.log(`   - Premium status`);
    console.log(`   - Subscription ID and expiration`);
    console.log(`   - Account creation date`);
    
    console.log(`\n⏳ Press Ctrl+C to cancel, or wait 5 seconds to proceed...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Perform factory reset
    console.log(`\n🔄 Resetting account...`);
    
    // Reset all user data to defaults
    user.dailyUsageCount = 0;
    user.lastUsageDate = new Date();
    user.customTopics = [];
    user.summaryHistory = [];
    user.scheduledSummaries = [];
    user.selectedTopics = [];
    user.selectedNewsSources = [];
    user.lastFetchedTopics = [];
    
    // Reset preferences to defaults
    user.selectedVoice = 'alloy';
    user.playbackRate = 1.0;
    user.upliftingNewsOnly = false;
    user.preferences = {};
    
    // Clear password reset tokens (if any)
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    // Clear email verification tokens (if any)
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    
    // Update updatedAt timestamp
    user.updatedAt = new Date();
    
    // Save the user
    await user.save();
    
    console.log(`\n✅ Account factory reset completed successfully!`);
    console.log(`\n📊 Reset data:`);
    console.log(`   Daily usage count: ${user.dailyUsageCount}`);
    console.log(`   Custom topics: ${user.customTopics.length} topics`);
    console.log(`   Summary history: ${user.summaryHistory.length} summaries`);
    console.log(`   Scheduled summaries: ${user.scheduledSummaries.length} schedules`);
    console.log(`   Selected topics: ${user.selectedTopics.length} topics`);
    console.log(`   Selected news sources: ${user.selectedNewsSources.length} sources`);
    console.log(`   Preferences: voice=${user.selectedVoice}, rate=${user.playbackRate}, uplifting=${user.upliftingNewsOnly}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting account:', error);
    process.exit(1);
  } finally {
    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\nDatabase connection closed.');
    }
  }
}

// Get email from command line arguments
const email = process.argv[2];

// Run the script
factoryResetAccount(email);



