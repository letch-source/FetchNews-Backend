#!/usr/bin/env node

/**
 * Environment Checker
 * 
 * This script helps verify your environment configuration
 * and shows the differences between dev and production settings.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 FetchNews Environment Checker\n');

// Load environment variables
require('dotenv').config();

const ENV = process.env.NODE_ENV || 'not set';
const IS_DEV = ENV === 'development';
const IS_PROD = ENV === 'production';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 CURRENT ENVIRONMENT');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`Environment: ${ENV}`);
console.log(`Mode: ${IS_DEV ? '🔧 Development' : IS_PROD ? '🚀 Production' : '⚠️  Unknown'}\n`);

// Check critical settings
const checks = [
  {
    name: 'Node Environment',
    key: 'NODE_ENV',
    current: process.env.NODE_ENV,
    devValue: 'development',
    prodValue: 'production',
    required: true
  },
  {
    name: 'Server Port',
    key: 'PORT',
    current: process.env.PORT,
    devValue: '3001',
    prodValue: '10000',
    required: false
  },
  {
    name: 'MongoDB URI',
    key: 'MONGODB_URI',
    current: process.env.MONGODB_URI ? '✓ Set' : '✗ Not set',
    devValue: 'mongodb://localhost:27017/fetchnews_dev',
    prodValue: 'mongodb+srv://...',
    required: true,
    hideValue: true
  },
  {
    name: 'Redis URL',
    key: 'REDIS_URL',
    current: process.env.REDIS_URL ? '✓ Set' : '✗ Not set (will use in-memory)',
    devValue: 'redis://localhost:6379/1',
    prodValue: 'redis://...',
    required: false,
    hideValue: true
  },
  {
    name: 'JWT Secret',
    key: 'JWT_SECRET',
    current: process.env.JWT_SECRET ? '✓ Set' : '✗ Not set',
    devValue: 'Any secure string',
    prodValue: 'Strong random secret',
    required: true,
    hideValue: true
  },
  {
    name: 'NewsAPI Key',
    key: 'NEWSAPI_KEY',
    current: process.env.NEWSAPI_KEY ? '✓ Set' : '✗ Not set',
    devValue: 'Your NewsAPI key',
    prodValue: 'Your NewsAPI key',
    required: true,
    hideValue: true
  },
  {
    name: 'OpenAI Key',
    key: 'OPENAI_API_KEY',
    current: process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Not set',
    devValue: 'Your OpenAI key',
    prodValue: 'Your OpenAI key',
    required: true,
    hideValue: true
  },
  {
    name: 'Frontend Origin',
    key: 'FRONTEND_ORIGIN',
    current: process.env.FRONTEND_ORIGIN || 'Not set',
    devValue: 'http://localhost:3000',
    prodValue: 'https://your-app.com',
    required: true
  },
  {
    name: 'B2 Bucket',
    key: 'B2_BUCKET_NAME',
    current: process.env.B2_BUCKET_NAME || 'Not set',
    devValue: 'fetchnews-dev-bucket',
    prodValue: 'fetchnews-production',
    required: false
  },
  {
    name: 'Google iOS Client',
    key: 'GOOGLE_IOS_CLIENT_ID',
    current: process.env.GOOGLE_IOS_CLIENT_ID ? '✓ Set' : '✗ Not set',
    devValue: 'Your client ID',
    prodValue: 'Your client ID',
    required: true,
    hideValue: true
  }
];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚙️  CONFIGURATION STATUS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

let hasErrors = false;
let hasWarnings = false;

checks.forEach(check => {
  const isSet = process.env[check.key] && process.env[check.key] !== 'your-' && 
                process.env[check.key] !== 'not set';
  const icon = isSet ? '✓' : (check.required ? '✗' : '⚠️');
  const status = isSet ? 'OK' : (check.required ? 'MISSING' : 'OPTIONAL');
  
  if (check.required && !isSet) {
    hasErrors = true;
  } else if (!check.required && !isSet) {
    hasWarnings = true;
  }
  
  console.log(`${icon} ${check.name.padEnd(20)} ${status.padEnd(10)} Current: ${check.hideValue && isSet ? '✓ Set (hidden)' : check.current}`);
  
  if (!isSet && (check.required || IS_PROD)) {
    if (IS_DEV) {
      console.log(`  └─ Dev:  ${check.devValue}`);
    }
    if (IS_PROD) {
      console.log(`  └─ Prod: ${check.prodValue}`);
    }
  }
  console.log();
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎯 ENVIRONMENT-SPECIFIC SETTINGS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const settings = [
  {
    feature: 'Rate Limiting',
    dev: '1000 requests / 15min',
    prod: '100 requests / 15min'
  },
  {
    feature: 'JWT Expiration',
    dev: '7 days',
    prod: '24 hours'
  },
  {
    feature: 'Auto Reload',
    dev: 'Yes (nodemon)',
    prod: 'No'
  },
  {
    feature: 'Logging Level',
    dev: 'Debug (verbose)',
    prod: 'Info (minimal)'
  },
  {
    feature: 'APNs Mode',
    dev: 'Sandbox',
    prod: 'Production'
  },
  {
    feature: 'Error Details',
    dev: 'Full stack traces',
    prod: 'Generic messages'
  }
];

console.log('Feature'.padEnd(25) + 'Development'.padEnd(25) + 'Production');
console.log('─'.repeat(75));
settings.forEach(s => {
  console.log(s.feature.padEnd(25) + s.dev.padEnd(25) + s.prod);
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔒 SECURITY CHECKLIST');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const securityChecks = [
  {
    check: 'Different JWT secrets for dev/prod',
    pass: true, // Can't easily verify
    note: 'Ensure your production JWT secret is different'
  },
  {
    check: 'Separate databases',
    pass: process.env.MONGODB_URI ? 
          (IS_DEV ? process.env.MONGODB_URI.includes('_dev') : true) : false,
    note: IS_DEV ? 'Use fetchnews_dev database' : 'Use production database'
  },
  {
    check: '.env file in .gitignore',
    pass: fs.existsSync(path.join(__dirname, '../../.gitignore')) &&
          fs.readFileSync(path.join(__dirname, '../../.gitignore'), 'utf8').includes('.env'),
    note: 'Never commit .env files to git'
  },
  {
    check: 'HTTPS in production',
    pass: IS_PROD ? 
          (process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.startsWith('https') : false) :
          true,
    note: IS_PROD ? 'Use HTTPS for production' : 'HTTP is okay for localhost'
  }
];

securityChecks.forEach(sc => {
  const icon = sc.pass ? '✓' : '⚠️';
  console.log(`${icon} ${sc.check}`);
  if (!sc.pass || sc.note) {
    console.log(`  └─ ${sc.note}`);
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (hasErrors) {
  console.log('❌ Configuration has ERRORS - Fix required settings before starting\n');
  console.log('Run this to create .env file:');
  console.log('  node scripts/setup-dev-env.js\n');
} else if (hasWarnings) {
  console.log('⚠️  Configuration has warnings - Optional settings missing\n');
  console.log('The server will work but some features may be limited.\n');
} else {
  console.log('✅ Configuration looks good!\n');
  if (IS_DEV) {
    console.log('Start development server with:');
    console.log('  npm run dev\n');
  } else if (IS_PROD) {
    console.log('Start production server with:');
    console.log('  npm run start:prod\n');
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Exit with appropriate code
if (hasErrors) {
  process.exit(1);
} else {
  process.exit(0);
}

