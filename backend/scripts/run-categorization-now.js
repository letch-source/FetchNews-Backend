#!/usr/bin/env node
/**
 * Manually Run Article Categorization Job
 * 
 * This script runs the categorization job immediately.
 * Useful for testing or manual updates outside the scheduled times.
 * 
 * Usage:
 *   node scripts/run-categorization-now.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { runCategorizationJob, getJobStatus } = require('../jobs/categorizeArticles');

async function main() {
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

    // Check if job is already running
    const status = getJobStatus();
    if (status.isRunning) {
      console.log('⚠️  Categorization job is already running!');
      console.log(`   Started at: ${status.lastRunTime}`);
      console.log('   Please wait for it to complete.');
      process.exit(0);
    }

    // Run the job
    console.log('🚀 Starting categorization job...\n');
    const stats = await runCategorizationJob();

    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('📊 JOB RESULTS');
    console.log('='.repeat(60));
    console.log(`Articles Fetched:    ${stats.articlesFetched}`);
    console.log(`Articles Processed:  ${stats.articlesProcessed}`);
    console.log(`Articles Saved:      ${stats.articlesSaved}`);
    console.log(`Duration:            ${(stats.duration / 1000).toFixed(2)}s`);
    if (stats.error) {
      console.log(`Error:               ${stats.error}`);
    }
    console.log('='.repeat(60));

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error running categorization job:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    
    // Close connection if open
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
}

main();
