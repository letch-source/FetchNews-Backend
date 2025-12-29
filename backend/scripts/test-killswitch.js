/**
 * Test Kill Switch
 * 
 * Verifies that DISABLE_NEWSAPI_FALLBACK is working correctly
 * Run with: node scripts/test-killswitch.js
 */

require('dotenv').config();

console.log('🧪 Testing NewsAPI Kill Switch\n');

const DISABLE_NEWSAPI_FALLBACK = process.env.DISABLE_NEWSAPI_FALLBACK === 'true';

console.log('Environment Variables:');
console.log(`  DISABLE_NEWSAPI_FALLBACK: ${process.env.DISABLE_NEWSAPI_FALLBACK}`);
console.log(`  Parsed as boolean: ${DISABLE_NEWSAPI_FALLBACK}`);
console.log('');

if (DISABLE_NEWSAPI_FALLBACK) {
  console.log('✅ Kill switch is ENABLED');
  console.log('   All NewsAPI calls will be blocked');
  console.log('   User requests will return empty results');
  console.log('   Categorization job will not run');
  console.log('');
  console.log('⚠️  To disable kill switch:');
  console.log('   1. Edit backend/.env');
  console.log('   2. Change DISABLE_NEWSAPI_FALLBACK=false');
  console.log('   3. Restart backend');
} else {
  console.log('⚠️  Kill switch is DISABLED');
  console.log('   NewsAPI calls are allowed');
  console.log('   This may hit rate limits if cache is empty');
  console.log('');
  console.log('💡 To enable kill switch:');
  console.log('   1. Edit backend/.env');
  console.log('   2. Add or change to DISABLE_NEWSAPI_FALLBACK=true');
  console.log('   3. Restart backend');
}

console.log('');
console.log('📊 Current Status:');
console.log(`  NewsAPI Key: ${process.env.NEWSAPI_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  OpenAI Key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  MongoDB URI: ${process.env.MONGODB_URI ? '✅ Set' : '❌ Missing'}`);
console.log('');

process.exit(0);

