#!/usr/bin/env node
/**
 * Migration script to move preferences.length to summaryLength field
 * This ensures existing users' Summary Length preferences are preserved
 * 
 * Run this script after deploying the backend changes:
 * node backend/scripts/migrate-summary-length.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrateSummaryLength() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fetchnews';
    console.log('[MIGRATION] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[MIGRATION] Connected to MongoDB');
    
    // Find all users that have preferences.length but no summaryLength
    const users = await User.find({
      $or: [
        { summaryLength: { $exists: false } },
        { summaryLength: null },
        { summaryLength: '' }
      ],
      'preferences.length': { $exists: true }
    });
    
    console.log(`[MIGRATION] Found ${users.length} users to migrate`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const user of users) {
      const oldLength = user.preferences?.length;
      
      if (oldLength) {
        console.log(`[MIGRATION] Migrating user ${user.email}: preferences.length = ${oldLength}`);
        user.summaryLength = oldLength;
        await user.save();
        migratedCount++;
      } else {
        console.log(`[MIGRATION] Skipping user ${user.email}: no preferences.length found`);
        skippedCount++;
      }
    }
    
    console.log(`[MIGRATION] Migration complete!`);
    console.log(`[MIGRATION] - Migrated: ${migratedCount} users`);
    console.log(`[MIGRATION] - Skipped: ${skippedCount} users`);
    
    // Close connection
    await mongoose.connection.close();
    console.log('[MIGRATION] MongoDB connection closed');
    
  } catch (error) {
    console.error('[MIGRATION] Error during migration:', error);
    process.exit(1);
  }
}

// Run migration
migrateSummaryLength().then(() => {
  console.log('[MIGRATION] Script completed successfully');
  process.exit(0);
}).catch(error => {
  console.error('[MIGRATION] Script failed:', error);
  process.exit(1);
});
