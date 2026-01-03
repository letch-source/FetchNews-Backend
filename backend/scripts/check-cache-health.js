#!/usr/bin/env node

/**
 * Quick script to check cache health and verify scheduled fetches are using cached articles
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ArticleCache = require('../models/ArticleCache');

async function checkCacheHealth() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not set in environment');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get cache statistics
    console.log('📊 CACHE HEALTH CHECK');
    console.log('='.repeat(60));
    
    const stats = await ArticleCache.getStats();
    
    console.log(`\n📈 Overall Stats:`);
    console.log(`  Total articles in cache: ${stats.total}`);
    console.log(`  Oldest article: ${stats.oldestArticle?.toISOString() || 'N/A'}`);
    console.log(`  Newest article: ${stats.newestArticle?.toISOString() || 'N/A'}`);
    
    console.log(`\n📚 Articles by Category:`);
    for (const [category, count] of Object.entries(stats.byCategory || {})) {
      console.log(`  ${category}: ${count}`);
    }
    
    // Check for expired articles
    const expiredCount = await ArticleCache.countDocuments({
      expiresAt: { $lte: new Date() }
    });
    console.log(`\n⏰ Expired articles (should be cleaned): ${expiredCount}`);
    
    // Check recent articles (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await ArticleCache.countDocuments({
      fetchedAt: { $gte: oneDayAgo }
    });
    console.log(`📅 Articles fetched in last 24h: ${recentCount}`);
    
    // Sample some articles to show what's in cache
    console.log(`\n📰 Sample Cached Articles (last 5):`);
    const samples = await ArticleCache.find()
      .sort({ fetchedAt: -1 })
      .limit(5)
      .lean();
    
    for (const article of samples) {
      console.log(`\n  Title: ${article.title}`);
      console.log(`  Categories: ${article.categories?.join(', ') || 'none'}`);
      console.log(`  Source: ${article.source?.name || 'unknown'}`);
      console.log(`  Published: ${article.publishedAt?.toISOString() || 'unknown'}`);
      console.log(`  Expires: ${article.expiresAt?.toISOString() || 'unknown'}`);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Health assessment
    console.log('\n🏥 HEALTH ASSESSMENT:');
    if (stats.total === 0) {
      console.log('❌ CRITICAL: Cache is empty! Categorization job may not have run yet.');
      console.log('   Run: node backend/scripts/run-categorization-now.js');
    } else if (recentCount === 0) {
      console.log('⚠️  WARNING: No recent articles. Cache may be stale.');
      console.log('   Last update was more than 24h ago. Check cron job.');
    } else if (stats.total < 50) {
      console.log('⚠️  WARNING: Cache has fewer than 50 articles.');
      console.log('   Categorization job may have failed or returned few results.');
    } else {
      console.log('✅ HEALTHY: Cache is populated and recent!');
      console.log(`   ${stats.total} articles available for scheduled fetches.`);
    }
    
    await mongoose.connection.close();
    console.log('\n✅ Done!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error checking cache health:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
}

checkCacheHealth();
