#!/usr/bin/env node

/**
 * Quick script to check if selectedTopics are properly saved in MongoDB
 * Usage: node backend/scripts/check-selected-topics.js <email>
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');

async function checkSelectedTopics(email) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fetchnews');
    console.log('✅ Connected to MongoDB');

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log('\n📊 User Information:');
    console.log('  Email:', user.email);
    console.log('  ID:', user._id);
    console.log('\n🎯 Selected Topics:');
    console.log('  Count:', user.selectedTopics?.length || 0);
    console.log('  Topics:', JSON.stringify(user.selectedTopics || [], null, 2));
    
    console.log('\n📋 Other Topic Fields:');
    console.log('  Custom Topics:', JSON.stringify(user.customTopics || [], null, 2));
    console.log('  Last Fetched Topics:', JSON.stringify(user.lastFetchedTopics || [], null, 2));

    console.log('\n🔍 Preferences (as returned by getPreferences):');
    const preferences = user.getPreferences();
    console.log('  Selected Topics from getPreferences:', JSON.stringify(preferences.selectedTopics || [], null, 2));
    console.log('  Last Fetched Topics:', JSON.stringify(preferences.lastFetchedTopics || [], null, 2));

    await mongoose.connection.close();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get email from command line
const email = process.argv[2];
if (!email) {
  console.log('Usage: node check-selected-topics.js <email>');
  console.log('Example: node check-selected-topics.js user@example.com');
  process.exit(1);
}

checkSelectedTopics(email);
