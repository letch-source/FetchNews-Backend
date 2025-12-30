const mongoose = require('mongoose');
const connectDB = require('../config/database');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

mongoose.set('strictQuery', false);

async function getAdminToken(email, password) {
  try {
    if (!email) {
      console.error('❌ Error: Email address is required');
      console.log('Usage: node scripts/get-admin-token.js <email> [password]');
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
      console.log('\n💡 You may need to:');
      console.log('   1. Sign in with Google through the iOS app');
      console.log('   2. Or register a new account');
      process.exit(1);
    }
    
    console.log(`\n✅ Found account:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Google ID: ${user.googleId || 'None (email/password account)'}`);
    console.log(`   Premium: ${user.isPremium}`);
    
    // Check if password is provided and verify it
    if (password) {
      const bcrypt = require('bcryptjs');
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        console.error(`❌ Invalid password for account: ${email}`);
        process.exit(1);
      }
      console.log(`   ✅ Password verified`);
    }
    
    // Generate JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-here';
    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });
    
    console.log(`\n🎫 JWT Token (valid for 7 days):`);
    console.log(`\n${token}\n`);
    console.log(`📋 Copy this token and use it in the admin interface when prompted.`);
    
    // Also check if account has Google ID (required for admin)
    if (!user.googleId) {
      console.log(`\n⚠️  WARNING: This account doesn't have Google authentication.`);
      console.log(`   The admin interface requires Google authentication.`);
      console.log(`   You may need to sign in with Google first, or modify the admin middleware.`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get email and password from command line arguments
const email = process.argv[2];
const password = process.argv[3];

getAdminToken(email, password);



