/**
 * Environment Configuration
 * 
 * This module centralizes environment-specific settings and provides
 * helpers to manage dev vs production configurations.
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const config = {
  // Environment flags
  isDevelopment,
  isProduction,
  isTest,
  
  // Server settings
  port: process.env.PORT || (isDevelopment ? 3001 : 10000),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database settings
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fetchnews_dev',
    options: {
      // Add any MongoDB-specific options here
    }
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379/1',
    // Redis falls back to in-memory cache if not available
    enabled: !!process.env.REDIS_URL
  },
  
  // Security
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: isDevelopment ? '7d' : '24h' // Longer tokens in dev for convenience
  },
  
  // CORS
  cors: {
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
    credentials: true
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 1000 : 100, // More lenient in development
    message: { error: "Too many requests, please try again later." }
  },
  
  // Logging
  logging: {
    level: isDevelopment ? 'debug' : 'info',
    verbose: isDevelopment || process.env.DEBUG === 'true',
    // In production, only log errors and important info
    logRequests: isDevelopment
  },
  
  // External APIs
  apis: {
    newsApi: process.env.NEWSAPI_KEY,
    openAi: process.env.OPENAI_API_KEY,
    elevenLabs: {
      apiKey: process.env.ELEVENLABS_API_KEY,
      voiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
    }
  },
  
  // Cloud storage (Backblaze B2)
  storage: {
    b2: {
      keyId: process.env.B2_KEY_ID,
      applicationKey: process.env.B2_APPLICATION_KEY,
      bucketName: process.env.B2_BUCKET_NAME || (isDevelopment ? 'fetchnews-dev' : 'fetchnews-production'),
      endpoint: process.env.B2_ENDPOINT || 's3.us-west-004.backblazeb2.com',
      region: process.env.B2_REGION || 'us-west-004'
    }
  },
  
  // Email configuration
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM_EMAIL || (isDevelopment ? 'dev@fetchnews.app' : 'noreply@fetchnews.app')
    }
  },
  
  // Apple Push Notifications
  apn: {
    keyId: process.env.APN_KEY_ID,
    teamId: process.env.APN_TEAM_ID,
    bundleId: process.env.APN_BUNDLE_ID || 'com.fetchnews.app',
    keyContent: process.env.APN_KEY_CONTENT,
    keyPath: process.env.APN_KEY_PATH,
    production: isProduction // Use sandbox in development
  },
  
  // Google OAuth
  google: {
    iosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.GOOGLE_CLIENT_ID
  }
};

/**
 * Validate required environment variables
 */
function validateConfig() {
  const errors = [];
  
  // Critical settings that must be present in production
  if (isProduction) {
    if (!config.jwt.secret || config.jwt.secret === 'dev-secret-change-me') {
      errors.push('JWT_SECRET must be set in production');
    }
    if (!config.mongodb.uri) {
      errors.push('MONGODB_URI must be set in production');
    }
    if (!config.apis.newsApi) {
      errors.push('NEWSAPI_KEY must be set in production');
    }
    if (!config.apis.openAi) {
      errors.push('OPENAI_API_KEY must be set in production');
    }
    if (!config.google.iosClientId) {
      errors.push('GOOGLE_IOS_CLIENT_ID must be set in production');
    }
  }
  
  // Warnings for development
  if (isDevelopment) {
    if (config.jwt.secret === 'dev-secret-change-me') {
      console.warn('⚠️  Using default JWT secret. Set JWT_SECRET in .env for better security.');
    }
    if (!config.redis.enabled) {
      console.warn('⚠️  Redis not configured. Using in-memory cache (data will be lost on restart).');
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

/**
 * Log the current environment configuration (without secrets)
 */
function logConfig() {
  if (!config.logging.verbose) return;
  
  console.log('\n=================================');
  console.log('📋 Environment Configuration');
  console.log('=================================');
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Port: ${config.port}`);
  console.log(`MongoDB: ${config.mongodb.uri.replace(/\/\/.*@/, '//***@')}`); // Hide credentials
  console.log(`Redis: ${config.redis.enabled ? 'Enabled' : 'Disabled (in-memory)'}`);
  console.log(`Rate Limit: ${config.rateLimit.max} requests per ${config.rateLimit.windowMs / 60000} minutes`);
  console.log(`Log Level: ${config.logging.level}`);
  console.log(`CORS Origin: ${config.cors.origin}`);
  console.log(`B2 Bucket: ${config.storage.b2.bucketName || 'Not configured'}`);
  console.log(`APNs Mode: ${config.apn.production ? 'Production' : 'Sandbox'}`);
  console.log(`JWT Expiry: ${config.jwt.expiresIn}`);
  console.log('=================================\n');
}

module.exports = {
  config,
  validateConfig,
  logConfig,
  isDevelopment,
  isProduction,
  isTest
};

