#!/usr/bin/env node

/**
 * Development Environment Setup Script
 * 
 * This script helps you set up a development environment by:
 * 1. Checking if .env file exists
 * 2. Creating a template .env file if needed
 * 3. Validating environment configuration
 * 4. Setting up development database
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');
const ENV_EXAMPLE = path.join(ROOT_DIR, 'env.example');

console.log('🚀 FetchNews Development Environment Setup\n');

// Check if .env exists
if (fs.existsSync(ENV_FILE)) {
  console.log('✓ .env file found');
  
  // Load and validate
  require('dotenv').config({ path: ENV_FILE });
  
  console.log('\n📋 Current Configuration:');
  console.log('  Environment:', process.env.NODE_ENV || 'not set');
  console.log('  Port:', process.env.PORT || 'not set');
  console.log('  MongoDB:', process.env.MONGODB_URI ? '✓ set' : '✗ not set');
  console.log('  JWT Secret:', process.env.JWT_SECRET ? '✓ set' : '✗ not set');
  console.log('  NewsAPI Key:', process.env.NEWSAPI_KEY ? '✓ set' : '✗ not set');
  console.log('  OpenAI Key:', process.env.OPENAI_API_KEY ? '✓ set' : '✗ not set');
  
  // Check if it's properly configured for development
  if (process.env.NODE_ENV !== 'development') {
    console.log('\n⚠️  NODE_ENV is not set to "development"');
    console.log('   Add this to your .env file:');
    console.log('   NODE_ENV=development\n');
  }
  
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.includes('_dev')) {
    console.log('\n⚠️  Warning: MongoDB URI doesn\'t include "_dev"');
    console.log('   Consider using a separate development database:');
    console.log('   MONGODB_URI=mongodb://localhost:27017/fetchnews_dev\n');
  }
  
} else {
  console.log('✗ .env file not found');
  console.log('\n📝 Creating development .env file...\n');
  
  // Generate a random JWT secret
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  
  const envContent = `# FetchNews Development Environment
# Created: ${new Date().toISOString()}

# ============================================
# ENVIRONMENT
# ============================================
NODE_ENV=development
PORT=3001

# ============================================
# SECURITY
# ============================================
JWT_SECRET=${jwtSecret}

# ============================================
# DATABASES
# ============================================
MONGODB_URI=mongodb://localhost:27017/fetchnews_dev
REDIS_URL=redis://localhost:6379/1

# ============================================
# FRONTEND
# ============================================
FRONTEND_ORIGIN=http://localhost:3000

# ============================================
# API KEYS (Add your development keys)
# ============================================
NEWSAPI_KEY=your-dev-newsapi-key-here
OPENAI_API_KEY=your-dev-openai-key-here
ELEVENLABS_API_KEY=your-dev-elevenlabs-key-here
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# ============================================
# CLOUD STORAGE
# ============================================
B2_KEY_ID=your-dev-b2-key-id-here
B2_APPLICATION_KEY=your-dev-b2-app-key-here
B2_BUCKET_NAME=fetchnews-dev-bucket
B2_ENDPOINT=s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004

# ============================================
# GOOGLE OAUTH
# ============================================
GOOGLE_IOS_CLIENT_ID=your-dev-ios-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your-dev-web-client-id.apps.googleusercontent.com

# ============================================
# EMAIL
# ============================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-dev-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
SMTP_FROM_EMAIL=dev@fetchnews.app

# ============================================
# APPLE PUSH NOTIFICATIONS
# ============================================
APN_KEY_ID=your-dev-apns-key-id
APN_TEAM_ID=your-apple-team-id
APN_BUNDLE_ID=com.fetchnews.app
APN_KEY_CONTENT=-----BEGIN PRIVATE KEY-----
...your key content here...
-----END PRIVATE KEY-----

# ============================================
# DEVELOPMENT OPTIONS
# ============================================
DEBUG=true
LOG_LEVEL=debug
`;

  try {
    fs.writeFileSync(ENV_FILE, envContent);
    console.log('✓ Created .env file with development defaults');
    console.log(`✓ Generated random JWT secret: ${jwtSecret.substring(0, 16)}...`);
  } catch (error) {
    console.error('✗ Failed to create .env file:', error.message);
    process.exit(1);
  }
}

console.log('\n📚 Next Steps:\n');
console.log('1. Edit the .env file and add your API keys:');
console.log('   - NEWSAPI_KEY (get from https://newsapi.org/)');
console.log('   - OPENAI_API_KEY (get from https://platform.openai.com/)');
console.log('   - Other API keys as needed\n');

console.log('2. Ensure MongoDB is running:');
console.log('   brew services start mongodb-community\n');

console.log('3. Ensure Redis is running (optional but recommended):');
console.log('   brew services start redis\n');

console.log('4. Start the development server:');
console.log('   npm run dev\n');

console.log('5. Test the server:');
console.log('   curl http://localhost:3001/api/health\n');

console.log('✨ Happy coding!\n');

