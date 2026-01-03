#!/usr/bin/env node

/**
 * Manual Fetch Testing Script
 * 
 * Test fetching articles from cache without hitting NewsAPI
 * Usage: node backend/scripts/test-manual-fetch.js
 */

const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function getCacheStats() {
  try {
    console.log(`\n${colors.cyan}📊 Fetching cache statistics...${colors.reset}`);
    const response = await axios.get(`${BASE_URL}/api/test-fetch/cache-stats`);
    const { health, stats } = response.data;
    
    console.log(`\n${colors.bright}Cache Health:${colors.reset}`);
    console.log(`  Status: ${health.healthy ? colors.green + '✅ Healthy' : colors.red + '❌ Unhealthy'}${colors.reset}`);
    console.log(`  Total Articles: ${health.total}`);
    console.log(`  Newest Article: ${health.newestArticleAge}`);
    console.log(`  Categories: ${health.categories}`);
    console.log(`  Message: ${health.message}`);
    
    if (stats.categories && stats.categories.length > 0) {
      console.log(`\n${colors.bright}Available Categories (Top 20):${colors.reset}`);
      stats.categories.slice(0, 20).forEach((cat, i) => {
        console.log(`  ${i + 1}. ${colors.cyan}${cat.category}${colors.reset} (${cat.count} articles)`);
      });
    }
    
    return health.healthy;
  } catch (error) {
    console.error(`${colors.red}❌ Error fetching cache stats:${colors.reset}`, error.message);
    return false;
  }
}

async function testFetch(config) {
  try {
    console.log(`\n${colors.cyan}🚀 Initiating manual fetch test...${colors.reset}`);
    console.log(`${colors.bright}Configuration:${colors.reset}`);
    console.log(`  Topics: ${config.topics?.join(', ') || 'none'}`);
    console.log(`  Custom Topics: ${config.customTopics?.join(', ') || 'none'}`);
    console.log(`  Word Count: ${config.wordCount || 200}`);
    console.log(`  Good News Only: ${config.goodNewsOnly || false}`);
    
    const response = await axios.post(`${BASE_URL}/api/test-fetch`, config);
    const result = response.data;
    
    console.log(`\n${colors.green}✅ Fetch completed successfully!${colors.reset}`);
    console.log(`\n${colors.bright}Summary:${colors.reset}`);
    console.log(`  Total Topics: ${result.summary.totalTopics}`);
    console.log(`  Successful: ${colors.green}${result.summary.successfulTopics}${colors.reset}`);
    console.log(`  Failed: ${result.summary.failedTopics > 0 ? colors.red : colors.green}${result.summary.failedTopics}${colors.reset}`);
    console.log(`  Total Articles: ${result.summary.totalArticles}`);
    
    console.log(`\n${colors.bright}Topic Results:${colors.reset}`);
    result.topicResults.forEach((topicResult, i) => {
      const statusIcon = topicResult.status === 'success' ? '✅' : '❌';
      const statusColor = topicResult.status === 'success' ? colors.green : colors.red;
      console.log(`\n  ${i + 1}. ${statusIcon} ${colors.cyan}${topicResult.topic}${colors.reset}`);
      console.log(`     Status: ${statusColor}${topicResult.status}${colors.reset}`);
      
      if (topicResult.status === 'success') {
        console.log(`     Articles Found: ${topicResult.articlesFound}`);
        console.log(`     Relevant Articles: ${topicResult.relevantArticles}`);
        console.log(`     Summary Length: ${topicResult.summaryLength} chars`);
        
        if (topicResult.articles && topicResult.articles.length > 0) {
          console.log(`     ${colors.bright}Sample Articles:${colors.reset}`);
          topicResult.articles.slice(0, 3).forEach((article, j) => {
            console.log(`       ${j + 1}. ${article.title}`);
            console.log(`          Source: ${article.source} | ${article.publishedAt}`);
          });
        }
        
        if (topicResult.summary) {
          console.log(`     ${colors.bright}Summary Preview:${colors.reset}`);
          const preview = topicResult.summary.slice(0, 150);
          console.log(`       ${preview}...`);
        }
      } else if (topicResult.error) {
        console.log(`     Error: ${colors.red}${topicResult.error}${colors.reset}`);
      }
    });
    
    if (result.combinedSummary) {
      console.log(`\n${colors.bright}Combined Summary:${colors.reset}`);
      console.log(`  Length: ${result.combinedSummary.length} chars`);
      console.log(`  Preview: ${result.combinedSummary.slice(0, 200)}...`);
    }
    
    return result;
  } catch (error) {
    console.error(`${colors.red}❌ Error during fetch test:${colors.reset}`);
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Error: ${error.response.data.error || error.message}`);
      if (error.response.data.suggestion) {
        console.log(`\n${colors.yellow}💡 Suggestion: ${error.response.data.suggestion}${colors.reset}`);
      }
    } else {
      console.error(`  ${error.message}`);
    }
    return null;
  }
}

async function getSampleArticles(topic, limit = 5) {
  try {
    console.log(`\n${colors.cyan}📰 Fetching sample articles for "${topic}"...${colors.reset}`);
    const response = await axios.get(`${BASE_URL}/api/test-fetch/sample-articles/${encodeURIComponent(topic)}?limit=${limit}`);
    const result = response.data;
    
    console.log(`\n${colors.bright}Found ${result.count} articles:${colors.reset}`);
    result.articles.forEach((article, i) => {
      console.log(`\n  ${i + 1}. ${article.title}`);
      console.log(`     Source: ${article.source}`);
      console.log(`     Published: ${article.publishedAt}`);
      console.log(`     URL: ${article.url}`);
    });
  } catch (error) {
    console.error(`${colors.red}❌ Error fetching sample articles:${colors.reset}`, error.message);
  }
}

async function interactiveMode() {
  console.log(`\n${colors.bright}${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║  Manual Fetch Testing - Interactive Mode  ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}\n`);
  
  // Check cache health first
  const healthy = await getCacheStats();
  
  if (!healthy) {
    console.log(`\n${colors.yellow}⚠️  Cache is not healthy. Tests may fail.${colors.reset}`);
    const proceed = await prompt(`\nProceed anyway? (y/n): `);
    if (proceed.toLowerCase() !== 'y') {
      console.log(`\n${colors.yellow}Exiting...${colors.reset}`);
      rl.close();
      return;
    }
  }
  
  console.log(`\n${colors.bright}Test Options:${colors.reset}`);
  console.log(`  ${colors.cyan}1${colors.reset}) Quick test with predefined topics`);
  console.log(`  ${colors.cyan}2${colors.reset}) Custom test (enter your own topics)`);
  console.log(`  ${colors.cyan}3${colors.reset}) View sample articles for a topic`);
  console.log(`  ${colors.cyan}4${colors.reset}) Exit`);
  
  const choice = await prompt(`\nSelect option (1-4): `);
  
  switch (choice.trim()) {
    case '1':
      // Quick test
      console.log(`\n${colors.bright}Running quick test with: Technology, Sports, Business${colors.reset}`);
      await testFetch({
        topics: ['technology', 'sports', 'business'],
        wordCount: 200,
        goodNewsOnly: false
      });
      break;
      
    case '2':
      // Custom test
      const topicsInput = await prompt(`\nEnter topics (comma-separated): `);
      const topics = topicsInput.split(',').map(t => t.trim()).filter(t => t);
      
      const customTopicsInput = await prompt(`Enter custom topics (comma-separated, or press Enter to skip): `);
      const customTopics = customTopicsInput.split(',').map(t => t.trim()).filter(t => t);
      
      const wordCountInput = await prompt(`Word count (default 200): `);
      const wordCount = parseInt(wordCountInput) || 200;
      
      const goodNewsInput = await prompt(`Good news only? (y/n, default n): `);
      const goodNewsOnly = goodNewsInput.toLowerCase() === 'y';
      
      await testFetch({
        topics,
        customTopics,
        wordCount,
        goodNewsOnly
      });
      break;
      
    case '3':
      // Sample articles
      const topic = await prompt(`\nEnter topic: `);
      const limitInput = await prompt(`How many articles? (default 5): `);
      const limit = parseInt(limitInput) || 5;
      await getSampleArticles(topic, limit);
      break;
      
    case '4':
      console.log(`\n${colors.cyan}👋 Goodbye!${colors.reset}`);
      rl.close();
      return;
      
    default:
      console.log(`\n${colors.red}Invalid option${colors.reset}`);
  }
  
  // Ask if user wants to run another test
  const again = await prompt(`\n${colors.bright}Run another test? (y/n): ${colors.reset}`);
  if (again.toLowerCase() === 'y') {
    await interactiveMode();
  } else {
    console.log(`\n${colors.cyan}👋 Goodbye!${colors.reset}`);
    rl.close();
  }
}

async function quickTest() {
  console.log(`\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║  Manual Fetch Testing - Quick Mode   ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════╝${colors.reset}\n`);
  
  await getCacheStats();
  
  console.log(`\n${colors.bright}Running quick test...${colors.reset}`);
  await testFetch({
    topics: ['technology', 'sports'],
    customTopics: [],
    wordCount: 200,
    goodNewsOnly: false
  });
  
  rl.close();
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--quick')) {
    await quickTest();
  } else {
    await interactiveMode();
  }
}

main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  rl.close();
  process.exit(1);
});
