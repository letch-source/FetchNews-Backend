/**
 * Test Script for Article Categorization
 * 
 * Run with: node scripts/test-categorization.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { runCategorizationJob, getJobStatus } = require('../jobs/categorizeArticles');
const ArticleCache = require('../models/ArticleCache');

async function test() {
  console.log('🧪 Testing Article Categorization System\n');
  
  try {
    // Connect to MongoDB
    console.log('1️⃣  Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected\n');
    
    // Check current cache stats
    console.log('2️⃣  Checking current cache statistics...');
    const beforeStats = await ArticleCache.getStats();
    console.log(`   Total articles in cache: ${beforeStats.total}`);
    console.log(`   Categories:`, beforeStats.byCategory.map(c => `${c._id}: ${c.count}`).join(', '));
    console.log('');
    
    // Get job status
    console.log('3️⃣  Checking job status...');
    const status = getJobStatus();
    console.log(`   Is running: ${status.isRunning}`);
    console.log(`   Last run: ${status.lastRunTime || 'Never'}`);
    console.log('');
    
    // Run categorization job
    console.log('4️⃣  Running categorization job...');
    console.log('   (This will take 2-5 minutes)\n');
    
    const startTime = Date.now();
    const stats = await runCategorizationJob();
    const duration = (Date.now() - startTime) / 1000;
    
    console.log('\n✅ Job completed!\n');
    console.log('📊 Results:');
    console.log(`   Duration: ${duration.toFixed(2)}s`);
    console.log(`   Articles fetched: ${stats.articlesFetched}`);
    console.log(`   Articles processed: ${stats.articlesProcessed}`);
    console.log(`   Articles saved: ${stats.articlesSaved}`);
    
    if (stats.articlesFailed > 0) {
      console.log(`   ⚠️  Articles failed: ${stats.articlesFailed}`);
    }
    
    // Check after stats
    console.log('\n5️⃣  Checking cache after categorization...');
    const afterStats = await ArticleCache.getStats();
    console.log(`   Total articles in cache: ${afterStats.total} (was ${beforeStats.total})`);
    console.log(`   New articles added: ${afterStats.total - beforeStats.total}`);
    console.log('\n   Category distribution:');
    afterStats.byCategory.forEach(cat => {
      console.log(`      ${cat._id}: ${cat.count} articles`);
    });
    
    // Test category queries
    console.log('\n6️⃣  Testing category queries...');
    const healthArticles = await ArticleCache.getByCategory('health', 5);
    console.log(`   Health articles: ${healthArticles.length}`);
    if (healthArticles.length > 0) {
      console.log(`   Sample: "${healthArticles[0].title}" from ${healthArticles[0].source.name}`);
    }
    
    const techArticles = await ArticleCache.getByCategory('technology', 5);
    console.log(`   Technology articles: ${techArticles.length}`);
    if (techArticles.length > 0) {
      console.log(`   Sample: "${techArticles[0].title}" from ${techArticles[0].source.name}`);
    }
    
    console.log('\n✅ All tests passed!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
