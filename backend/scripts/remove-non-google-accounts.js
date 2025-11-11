#!/usr/bin/env node

/**
 * Script to remove all non-Google accounts from the database
 * This ensures only Google-authenticated users remain in the system
 * 
 * Usage: node scripts/remove-non-google-accounts.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const User = require('../models/User');

// Suppress mongoose deprecation warnings for this script
mongoose.set('strictQuery', false);

async function removeNonGoogleAccounts() {
  try {
    console.log('Connecting to database...');
    await connectDB();
    
    // Wait a moment for connection to establish
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Failed to connect to database. Please check your MONGODB_URI.');
      process.exit(1);
    }
    
    console.log('Finding all users without googleId...');
    
    // Use a more flexible query that works even if googleId field doesn't exist in schema
    // Query directly using mongoose's find with $or conditions
    const nonGoogleUsers = await User.find({ 
      $or: [
        { googleId: { $exists: false } },
        { googleId: null },
        { googleId: '' }
      ]
    }).lean(); // Use lean() to get plain objects
    
    console.log(`Found ${nonGoogleUsers.length} non-Google accounts to remove`);
    
    if (nonGoogleUsers.length === 0) {
      console.log('✅ No non-Google accounts found. Database is clean!');
      
      // Verify all remaining users have googleId
      const allUsers = await User.find({}).lean();
      const usersWithGoogleId = allUsers.filter(u => u.googleId && u.googleId.trim() !== '');
      console.log(`✅ Verified: All ${usersWithGoogleId.length} users have Google accounts`);
      
      process.exit(0);
    }
    
    // Display accounts that will be deleted
    console.log('\n⚠️  Accounts to be deleted:');
    nonGoogleUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.email} (ID: ${user._id})`);
    });
    
    // Confirm deletion
    console.log(`\n⚠️  WARNING: This will permanently delete ${nonGoogleUsers.length} account(s).`);
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Delete all non-Google accounts
    const result = await User.deleteMany({
      $or: [
        { googleId: { $exists: false } },
        { googleId: null },
        { googleId: '' }
      ]
    });
    
    console.log(`\n✅ Successfully deleted ${result.deletedCount} non-Google account(s)`);
    
    // Verify remaining users all have googleId
    const remainingUsers = await User.find({}).lean();
    const usersWithoutGoogleId = remainingUsers.filter(u => !u.googleId || u.googleId.trim() === '');
    
    if (usersWithoutGoogleId.length > 0) {
      console.log(`\n⚠️  Warning: Found ${usersWithoutGoogleId.length} user(s) still without googleId:`);
      usersWithoutGoogleId.forEach(user => {
        console.log(`  - ${user.email} (ID: ${user._id})`);
      });
      process.exit(1);
    } else {
      console.log(`\n✅ All remaining ${remainingUsers.length} user(s) have Google accounts`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error removing non-Google accounts:', error);
    process.exit(1);
  } finally {
    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\nDatabase connection closed.');
    }
  }
}

// Run the script
removeNonGoogleAccounts();

