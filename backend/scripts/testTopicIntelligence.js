#!/usr/bin/env node

/**
 * Test script for Topic Intelligence System
 * Tests various topic types and validates responses
 * 
 * Usage: node scripts/testTopicIntelligence.js
 */

require('dotenv').config();
const topicIntelligence = require('../services/topicIntelligence');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, COLORS.reset);
}

async function testTopic(topic, expectedSpecificity, context = {}) {
  log(COLORS.cyan, `\n━━━ Testing: "${topic}" ━━━`);
  
  try {
    const startTime = Date.now();
    const analysis = await topicIntelligence.analyzeTopicSpecificity(topic, context);
    const duration = Date.now() - startTime;
    
    log(COLORS.blue, `⏱️  Duration: ${duration}ms`);
    log(COLORS.blue, `📊 Specificity: ${analysis.specificity}`);
    log(COLORS.blue, `💭 Reasoning: ${analysis.reasoning}`);
    
    if (analysis.suggestions.length > 0) {
      log(COLORS.blue, `💡 Suggestions: ${analysis.suggestions.join(', ')}`);
    }
    
    if (analysis.expandedTerms.length > 1) {
      log(COLORS.blue, `🔍 Expanded terms: ${analysis.expandedTerms.join(', ')}`);
    }
    
    // Validate expectation
    if (analysis.specificity === expectedSpecificity) {
      log(COLORS.green, `✅ PASS - Correctly identified as ${expectedSpecificity}`);
      return true;
    } else {
      log(COLORS.red, `❌ FAIL - Expected ${expectedSpecificity}, got ${analysis.specificity}`);
      return false;
    }
  } catch (error) {
    log(COLORS.red, `❌ ERROR: ${error.message}`);
    return false;
  }
}

async function testSearchTerms(topic, context = {}) {
  log(COLORS.cyan, `\n━━━ Testing Search Terms: "${topic}" ━━━`);
  
  try {
    const searchTerms = await topicIntelligence.generateSearchTerms(topic, context);
    
    log(COLORS.blue, `🎯 Primary terms: ${searchTerms.primaryTerms.join(', ')}`);
    log(COLORS.blue, `🔍 Secondary terms: ${searchTerms.secondaryTerms.join(', ')}`);
    
    if (searchTerms.excludeTerms.length > 0) {
      log(COLORS.blue, `🚫 Exclude terms: ${searchTerms.excludeTerms.join(', ')}`);
    }
    
    log(COLORS.green, `✅ Generated search terms successfully`);
    return true;
  } catch (error) {
    log(COLORS.red, `❌ ERROR: ${error.message}`);
    return false;
  }
}

async function testBatchAnalysis() {
  log(COLORS.cyan, `\n━━━ Testing Batch Analysis ━━━`);
  
  const topics = ['Politics', 'Technology', 'NFL', 'RNA research'];
  
  try {
    const startTime = Date.now();
    const results = await topicIntelligence.analyzeMultipleTopics(topics, { userCountry: 'us' });
    const duration = Date.now() - startTime;
    
    log(COLORS.blue, `⏱️  Duration: ${duration}ms for ${topics.length} topics`);
    log(COLORS.blue, `⏱️  Average: ${Math.round(duration / topics.length)}ms per topic`);
    
    results.forEach((result, i) => {
      const topic = result.topic || topics[i];
      const analysis = result.analysis || result;
      log(COLORS.blue, `  ${i + 1}. "${topic}" → ${analysis.specificity}`);
    });
    
    log(COLORS.green, `✅ Batch analysis completed`);
    return true;
  } catch (error) {
    log(COLORS.red, `❌ ERROR: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  log(COLORS.cyan, '\n╔═══════════════════════════════════════╗');
  log(COLORS.cyan, '║  Topic Intelligence Test Suite       ║');
  log(COLORS.cyan, '╚═══════════════════════════════════════╝\n');
  
  const results = [];
  
  // Test broad topics
  log(COLORS.yellow, '\n📊 Testing Broad Topics:');
  results.push(await testTopic('Politics', 'too_broad', { userCountry: 'us' }));
  results.push(await testTopic('Sports', 'too_broad', { userCountry: 'us' }));
  results.push(await testTopic('Technology', 'too_broad'));
  
  // Test specific topics
  log(COLORS.yellow, '\n📊 Testing Specific Topics:');
  results.push(await testTopic('RNA research', 'too_specific'));
  results.push(await testTopic('Quantum entanglement in superconductors', 'too_specific'));
  results.push(await testTopic('Pickleball tournaments in Vermont', 'too_specific'));
  
  // Test balanced topics
  log(COLORS.yellow, '\n📊 Testing Balanced Topics:');
  results.push(await testTopic('Artificial Intelligence', 'just_right'));
  results.push(await testTopic('Climate Change', 'just_right'));
  results.push(await testTopic('NFL', 'just_right'));
  results.push(await testTopic('Cryptocurrency', 'just_right'));
  
  // Test search term generation
  log(COLORS.yellow, '\n📊 Testing Search Term Generation:');
  results.push(await testSearchTerms('Politics', { userCountry: 'us' }));
  results.push(await testSearchTerms('RNA research', {}));
  results.push(await testSearchTerms('AI', { likedKeywords: ['machine learning', 'neural networks'] }));
  
  // Test batch analysis
  log(COLORS.yellow, '\n📊 Testing Batch Analysis:');
  results.push(await testBatchAnalysis());
  
  // Summary
  const passed = results.filter(r => r).length;
  const failed = results.filter(r => !r).length;
  const total = results.length;
  
  log(COLORS.cyan, '\n╔═══════════════════════════════════════╗');
  log(COLORS.cyan, '║  Test Summary                         ║');
  log(COLORS.cyan, '╚═══════════════════════════════════════╝\n');
  
  log(COLORS.green, `✅ Passed: ${passed}/${total}`);
  if (failed > 0) {
    log(COLORS.red, `❌ Failed: ${failed}/${total}`);
  }
  
  const percentage = Math.round((passed / total) * 100);
  if (percentage === 100) {
    log(COLORS.green, '\n🎉 All tests passed!');
  } else if (percentage >= 80) {
    log(COLORS.yellow, `\n⚠️  ${percentage}% tests passed (some failures)`);
  } else {
    log(COLORS.red, `\n❌ Only ${percentage}% tests passed`);
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    log(COLORS.red, '\n💥 Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runAllTests, testTopic };
