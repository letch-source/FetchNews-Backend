const mongoose = require('mongoose');
const connectDB = require('../config/database');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

mongoose.set('strictQuery', false);

async function verifyToken(token) {
  try {
    if (!token) {
      console.error('❌ Error: Token is required');
      console.log('Usage: node scripts/verify-token.js <token>');
      process.exit(1);
    }

    console.log('🔍 Verifying token...\n');
    
    // Get JWT_SECRET from environment
    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-here';
    console.log(`📋 Using JWT_SECRET: ${JWT_SECRET.substring(0, 10)}...${JWT_SECRET.substring(JWT_SECRET.length - 5)}`);
    console.log(`📋 Token length: ${token.length} characters\n`);

    // Try to decode the token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log('✅ Token signature is valid!');
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        console.error('❌ Invalid token signature');
        console.error(`   Error: ${error.message}`);
        console.error('\n💡 Possible causes:');
        console.error('   1. Token was signed with a different JWT_SECRET');
        console.error('   2. Token is malformed or corrupted');
        console.error('   3. Token was manually edited');
        process.exit(1);
      } else if (error.name === 'TokenExpiredError') {
        console.error('❌ Token has expired');
        console.error(`   Expired at: ${error.expiredAt}`);
        console.error('\n💡 Solution: Generate a new token using:');
        console.error('   node scripts/get-admin-token.js <your-email>');
        process.exit(1);
      } else {
        throw error;
      }
    }

    console.log('\n📋 Token payload:');
    console.log(`   User ID: ${decoded.userId}`);
    console.log(`   Issued at: ${new Date(decoded.iat * 1000).toISOString()}`);
    console.log(`   Expires at: ${new Date(decoded.exp * 1000).toISOString()}`);
    
    // Check if token is about to expire
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    if (timeUntilExpiry < 3600) {
      console.log(`\n⚠️  Warning: Token expires in ${Math.floor(timeUntilExpiry / 60)} minutes`);
    } else {
      console.log(`\n✅ Token is valid for ${Math.floor(timeUntilExpiry / 86400)} more days`);
    }

    // Try to connect to database and verify user exists
    console.log('\n🔍 Connecting to database to verify user...');
    try {
      await connectDB();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (mongoose.connection.readyState !== 1) {
        console.log('⚠️  Could not connect to database. Skipping user verification.');
        console.log('   Token is valid, but cannot verify if user exists.');
        process.exit(0);
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        console.error(`\n❌ User not found in database`);
        console.error(`   User ID: ${decoded.userId}`);
        console.error('\n💡 Possible causes:');
        console.error('   1. User was deleted from database');
        console.error('   2. Database was reset');
        console.error('   3. Wrong database environment');
        process.exit(1);
      }

      console.log(`\n✅ User found in database:`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Google ID: ${user.googleId || 'None'}`);
      console.log(`   Premium: ${user.isPremium}`);
      console.log(`   Created: ${user.createdAt}`);
      
      // Check if user has Google ID (required for some routes)
      if (!user.googleId) {
        console.log(`\n⚠️  Warning: User doesn't have Google authentication`);
        console.log('   Admin routes should work, but regular API routes may require Google auth');
      }

      console.log('\n✅ Token is fully valid and user exists in database!');
      console.log('   You can use this token in the admin interface.');
      
    } catch (dbError) {
      console.error('\n❌ Database error:', dbError.message);
      console.log('   Token signature is valid, but cannot verify user.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get token from command line arguments
const token = process.argv[2];

if (!token) {
  console.error('❌ Error: Token is required');
  console.log('Usage: node scripts/verify-token.js <token>');
  process.exit(1);
}

verifyToken(token);


