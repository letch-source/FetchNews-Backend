#!/usr/bin/env node

/**
 * Scheduled Summaries Cron Job
 * Runs every minute to check for and execute scheduled summaries
 */

const fetch = require('node-fetch');

// Get the backend URL from environment or use default
const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:3000';

console.log(`Scheduler starting - Backend URL: ${BACKEND_URL}`);

async function executeScheduledSummaries() {
  try {
    console.log(`[${new Date().toISOString()}] Checking for scheduled summaries...`);
    
    const response = await fetch(`${BACKEND_URL}/api/scheduled-summaries/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FetchNews-Scheduler/1.0'
      },
      timeout: 30000 // 30 second timeout
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[${new Date().toISOString()}] ${result.message}`);
    } else {
      const errorText = await response.text();
      console.error(`[${new Date().toISOString()}] Error executing scheduled summaries: ${response.status} ${errorText}`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to execute scheduled summaries:`, error.message);
  }
}

// Run immediately on startup
executeScheduledSummaries();

// Set up interval to run every minute
setInterval(executeScheduledSummaries, 60 * 1000); // 60 seconds

console.log('Scheduler started - will check for scheduled summaries every minute');
