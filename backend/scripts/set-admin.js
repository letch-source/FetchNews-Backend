/**
 * Set Admin Script
 * Makes a user an admin by email address
 * 
 * Usage:
 *   node scripts/set-admin.js your-email@example.com
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function setAdmin(email) {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fetchnews';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.error(`❌ User not found: ${email}`);
      console.log('   Make sure you sign in with Google first to create your account.');
      process.exit(1);
    }

    // Set admin flag
    user.isAdmin = true;
    await user.save();

    console.log('✅ Admin access granted!');
    console.log(`   User: ${user.email}`);
    console.log(`   Name: ${user.name || 'Not set'}`);
    console.log(`   Google ID: ${user.googleId ? 'Linked' : 'Not linked'}`);
    console.log(`   Admin: ${user.isAdmin ? 'Yes ✓' : 'No'}`);
    
    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/set-admin.js your-email@example.com');
  process.exit(1);
}

setAdmin(email);
