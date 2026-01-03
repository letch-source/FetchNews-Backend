#!/usr/bin/env node

/**
 * Test script for scheduler safeguards
 * Verifies that all safeguard systems are working correctly
 */

require('dotenv').config();
const mongoose = require('mongoose');
const SchedulerLock = require('../models/SchedulerLock');
const SchedulerExecution = require('../models/SchedulerExecution');
const CircuitBreaker = require('../utils/circuitBreaker');
const { SchedulerQueue } = require('../utils/schedulerQueue');

async function testDistributedLock() {
  console.log('\n🔒 Testing Distributed Lock...');
  
  const holder1 = 'test-instance-1';
  const holder2 = 'test-instance-2';
  
  try {
    // Test acquiring lock
    const acquired1 = await SchedulerLock.acquireLock('test-lock', holder1, 30000);
    if (!acquired1) throw new Error('Failed to acquire initial lock');
    console.log('  ✅ Lock acquired by instance 1');
    
    // Test that second instance cannot acquire
    const acquired2 = await SchedulerLock.acquireLock('test-lock', holder2, 30000);
    if (acquired2) throw new Error('Instance 2 should not have acquired lock');
    console.log('  ✅ Lock correctly blocked second instance');
    
    // Test heartbeat
    await new Promise(resolve => setTimeout(resolve, 1000));
    const heartbeat = await SchedulerLock.heartbeat('test-lock', holder1, 30000);
    if (!heartbeat) throw new Error('Heartbeat failed');
    console.log('  ✅ Heartbeat updated successfully');
    
    // Test lock info
    const info = await SchedulerLock.getLockInfo('test-lock');
    if (info.holder !== holder1) throw new Error('Lock info incorrect');
    console.log('  ✅ Lock info retrieved correctly');
    
    // Test release
    const released = await SchedulerLock.releaseLock('test-lock', holder1);
    if (!released) throw new Error('Lock release failed');
    console.log('  ✅ Lock released successfully');
    
    // Test that second instance can now acquire
    const acquired3 = await SchedulerLock.acquireLock('test-lock', holder2, 30000);
    if (!acquired3) throw new Error('Instance 2 should have acquired lock after release');
    console.log('  ✅ Lock re-acquired by instance 2 after release');
    
    // Cleanup
    await SchedulerLock.releaseLock('test-lock', holder2);
    
    console.log('  ✅ Distributed Lock: ALL TESTS PASSED');
  } catch (error) {
    console.error('  ❌ Distributed Lock test failed:', error.message);
    throw error;
  }
}

async function testIdempotency() {
  console.log('\n🔑 Testing Idempotency...');
  
  try {
    const userId = new mongoose.Types.ObjectId();
    const summaryId = 'test-summary-1';
    const scheduledDate = '2026-01-03';
    const topics = ['Technology', 'Business'];
    
    // Test creating new execution
    const result1 = await SchedulerExecution.getOrCreate(userId, summaryId, scheduledDate, topics);
    if (!result1.isNew || !result1.shouldExecute) {
      throw new Error('First execution should be new and executable');
    }
    console.log('  ✅ New execution created');
    
    // Test idempotency - should not create duplicate
    const result2 = await SchedulerExecution.getOrCreate(userId, summaryId, scheduledDate, topics);
    if (result2.isNew) {
      throw new Error('Second call should not create new execution');
    }
    console.log('  ✅ Duplicate creation prevented');
    
    // Mark as started
    await SchedulerExecution.markStarted(result1.execution.executionId);
    console.log('  ✅ Execution marked as started');
    
    // Check that running execution blocks new attempts
    const result3 = await SchedulerExecution.getOrCreate(userId, summaryId, scheduledDate, topics);
    if (result3.shouldExecute) {
      throw new Error('Running execution should block new attempts');
    }
    console.log('  ✅ Running execution correctly blocks duplicates');
    
    // Mark as completed
    await SchedulerExecution.markCompleted(result1.execution.executionId);
    console.log('  ✅ Execution marked as completed');
    
    // Check that completed execution blocks new attempts
    const result4 = await SchedulerExecution.getOrCreate(userId, summaryId, scheduledDate, topics);
    if (result4.shouldExecute) {
      throw new Error('Completed execution should block new attempts');
    }
    console.log('  ✅ Completed execution correctly blocks duplicates');
    
    // Test stats
    const stats = await SchedulerExecution.getStats(24);
    if (stats.completed < 1) {
      throw new Error('Stats should show at least 1 completed execution');
    }
    console.log(`  ✅ Stats retrieved: ${stats.completed} completed, ${stats.successRate} success rate`);
    
    // Cleanup
    await SchedulerExecution.deleteOne({ executionId: result1.execution.executionId });
    
    console.log('  ✅ Idempotency: ALL TESTS PASSED');
  } catch (error) {
    console.error('  ❌ Idempotency test failed:', error.message);
    throw error;
  }
}

function testCircuitBreaker() {
  console.log('\n⚡ Testing Circuit Breaker...');
  
  return new Promise((resolve, reject) => {
    try {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        resetTimeout: 5000
      });
      
      // Test initial state
      if (breaker.getStatus().state !== 'CLOSED') {
        throw new Error('Initial state should be CLOSED');
      }
      console.log('  ✅ Initial state is CLOSED');
      
      // Test successful execution
      breaker.execute(async () => 'success')
        .then(() => {
          console.log('  ✅ Successful execution passed');
          
          // Test failures
          const failurePromises = [];
          for (let i = 0; i < 3; i++) {
            failurePromises.push(
              breaker.execute(async () => {
                throw new Error('Test failure');
              }).catch(() => {})
            );
          }
          
          return Promise.all(failurePromises);
        })
        .then(() => {
          // Check circuit is now OPEN
          const status = breaker.getStatus();
          if (status.state !== 'OPEN') {
            throw new Error(`Circuit should be OPEN, but is ${status.state}`);
          }
          console.log('  ✅ Circuit opened after 3 failures');
          
          // Test that execution is blocked
          return breaker.execute(async () => 'should fail', async () => 'fallback')
            .then(result => {
              if (result !== 'fallback') {
                throw new Error('Circuit should have called fallback');
              }
              console.log('  ✅ Circuit correctly blocks requests when OPEN');
              console.log('  ✅ Fallback function called correctly');
            });
        })
        .then(() => {
          // Test reset
          breaker.reset();
          if (breaker.getStatus().state !== 'CLOSED') {
            throw new Error('Reset should set state to CLOSED');
          }
          console.log('  ✅ Manual reset works correctly');
          
          console.log('  ✅ Circuit Breaker: ALL TESTS PASSED');
          resolve();
        })
        .catch(reject);
      
    } catch (error) {
      console.error('  ❌ Circuit Breaker test failed:', error.message);
      reject(error);
    }
  });
}

function testQueue() {
  console.log('\n📋 Testing Queue System...');
  
  return new Promise((resolve, reject) => {
    try {
      const queue = new SchedulerQueue({ concurrency: 1 });
      
      let executionOrder = [];
      
      // Add jobs
      const job1 = queue.add({
        id: 'job-1',
        userId: 'user-1',
        execute: async () => {
          await new Promise(r => setTimeout(r, 100));
          executionOrder.push('job-1');
          return 'result-1';
        }
      });
      
      const job2 = queue.add({
        id: 'job-2',
        userId: 'user-2',
        execute: async () => {
          await new Promise(r => setTimeout(r, 100));
          executionOrder.push('job-2');
          return 'result-2';
        }
      });
      
      const job3 = queue.add({
        id: 'job-3',
        userId: 'user-3',
        execute: async () => {
          executionOrder.push('job-3');
          throw new Error('Test failure');
        },
        maxRetries: 1
      });
      
      console.log('  ✅ Jobs added to queue');
      
      // Wait for all jobs
      Promise.allSettled([job1, job2, job3])
        .then(results => {
          // Check results
          if (results[0].status !== 'fulfilled' || results[0].value !== 'result-1') {
            throw new Error('Job 1 should have succeeded');
          }
          console.log('  ✅ Job 1 completed successfully');
          
          if (results[1].status !== 'fulfilled' || results[1].value !== 'result-2') {
            throw new Error('Job 2 should have succeeded');
          }
          console.log('  ✅ Job 2 completed successfully');
          
          if (results[2].status !== 'rejected') {
            throw new Error('Job 3 should have failed');
          }
          console.log('  ✅ Job 3 failed as expected');
          
          // Check execution order
          if (executionOrder[0] !== 'job-1' || executionOrder[1] !== 'job-2') {
            throw new Error('Jobs should execute in order');
          }
          console.log('  ✅ Jobs executed in FIFO order');
          
          // Check stats
          const stats = queue.getStats();
          if (stats.totalSuccess < 2) {
            throw new Error('Stats should show at least 2 successes');
          }
          console.log(`  ✅ Stats: ${stats.totalSuccess} success, ${stats.totalFailed} failed`);
          
          console.log('  ✅ Queue System: ALL TESTS PASSED');
          resolve();
        })
        .catch(reject);
      
    } catch (error) {
      console.error('  ❌ Queue test failed:', error.message);
      reject(error);
    }
  });
}

async function main() {
  console.log('═'.repeat(60));
  console.log('🧪 TESTING SCHEDULER SAFEGUARDS');
  console.log('═'.repeat(60));
  
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not set in environment');
      process.exit(1);
    }
    
    console.log('\n🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Run tests
    await testDistributedLock();
    await testIdempotency();
    await testCircuitBreaker();
    await testQueue();
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('═'.repeat(60));
    console.log('\nYour scheduler safeguards are working correctly! 🎉\n');
    
    await mongoose.connection.close();
    process.exit(0);
    
  } catch (error) {
    console.error('\n' + '═'.repeat(60));
    console.error('❌ TESTS FAILED');
    console.error('═'.repeat(60));
    console.error('\nError:', error.message);
    console.error('Stack:', error.stack);
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
}

main();
