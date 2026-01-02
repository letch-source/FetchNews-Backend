/**
 * Scheduler Health and Monitoring Endpoints
 * Provides visibility into scheduler performance and status
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const SchedulerExecution = require('../models/SchedulerExecution');
const SchedulerLock = require('../models/SchedulerLock');

// Middleware to check admin access
async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.user._id || req.user.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

/**
 * Get overall scheduler health status
 */
router.get('/health', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    
    // Get execution statistics
    const execStats = await SchedulerExecution.getStats(hours);
    
    // Get lock information
    const lockInfo = await SchedulerLock.getLockInfo();
    
    // Get circuit breaker status (from global instance)
    const { getCircuitBreaker } = require('../index');
    const circuitBreakerStatus = getCircuitBreaker ? getCircuitBreaker().getStatus() : { state: 'UNKNOWN' };
    
    // Get queue status
    const { getQueue } = require('../utils/schedulerQueue');
    const queue = getQueue();
    const queueStatus = queue.getStatus();
    
    // Calculate health score
    let healthScore = 100;
    let issues = [];
    
    // Check success rate
    const successRate = parseFloat(execStats.successRate);
    if (successRate < 80) {
      healthScore -= 30;
      issues.push(`Low success rate: ${execStats.successRate}`);
    } else if (successRate < 90) {
      healthScore -= 15;
      issues.push(`Moderate success rate: ${execStats.successRate}`);
    }
    
    // Check circuit breaker
    if (circuitBreakerStatus.state === 'OPEN') {
      healthScore -= 40;
      issues.push('Circuit breaker is OPEN - scheduler disabled');
    } else if (circuitBreakerStatus.state === 'HALF_OPEN') {
      healthScore -= 20;
      issues.push('Circuit breaker is HALF_OPEN - recovering from failures');
    }
    
    // Check for stuck jobs
    if (execStats.running > 5) {
      healthScore -= 20;
      issues.push(`${execStats.running} jobs stuck in running state`);
    }
    
    // Check queue backlog
    if (queueStatus.queueLength > 10) {
      healthScore -= 15;
      issues.push(`Queue backlog: ${queueStatus.queueLength} jobs waiting`);
    }
    
    // Determine overall status
    let status = 'healthy';
    if (healthScore < 50) {
      status = 'critical';
    } else if (healthScore < 70) {
      status = 'degraded';
    } else if (healthScore < 90) {
      status = 'warning';
    }
    
    res.json({
      status,
      healthScore,
      issues,
      timestamp: new Date().toISOString(),
      metrics: {
        executions: execStats,
        circuitBreaker: circuitBreakerStatus,
        queue: queueStatus,
        lock: lockInfo ? {
          holder: lockInfo.holder,
          acquiredAt: lockInfo.acquiredAt,
          heartbeat: lockInfo.heartbeat,
          expiresAt: lockInfo.expiresAt
        } : null
      }
    });
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error getting health status:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

/**
 * Get recent executions
 */
router.get('/executions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status; // optional filter
    
    let query = {};
    if (status) {
      query.status = status;
    }
    
    const executions = await SchedulerExecution.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'email')
      .lean();
    
    res.json({ executions });
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error getting executions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get execution statistics
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    
    const stats = await SchedulerExecution.getStats(hours);
    
    // Get stats by user
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const userStats = await SchedulerExecution.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$userId',
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          avgDuration: {
            $avg: { $cond: [{ $ifNull: ['$duration', false] }, '$duration', null] }
          }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ]);
    
    // Populate user emails
    const populatedUserStats = await Promise.all(
      userStats.map(async (stat) => {
        const user = await User.findById(stat._id).select('email').lean();
        return {
          ...stat,
          userEmail: user?.email || 'Unknown'
        };
      })
    );
    
    res.json({
      overall: stats,
      byUser: populatedUserStats,
      period: `Last ${hours} hours`
    });
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get circuit breaker status
 */
router.get('/circuit-breaker', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { getCircuitBreaker } = require('../index');
    
    if (!getCircuitBreaker) {
      return res.status(503).json({ error: 'Circuit breaker not initialized' });
    }
    
    const status = getCircuitBreaker().getStatus();
    
    res.json({
      ...status,
      description: {
        CLOSED: 'Normal operation - all requests allowed',
        HALF_OPEN: 'Testing recovery - limited requests allowed',
        OPEN: 'Too many failures - requests blocked'
      }[status.state]
    });
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error getting circuit breaker status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reset circuit breaker (admin override)
 */
router.post('/circuit-breaker/reset', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { getCircuitBreaker } = require('../index');
    
    if (!getCircuitBreaker) {
      return res.status(503).json({ error: 'Circuit breaker not initialized' });
    }
    
    getCircuitBreaker().reset();
    
    console.log(`[SCHEDULER HEALTH] Circuit breaker reset by admin user ${req.user.email || req.user._id}`);
    
    res.json({ 
      message: 'Circuit breaker reset successfully',
      status: getCircuitBreaker().getStatus()
    });
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error resetting circuit breaker:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get queue status
 */
router.get('/queue', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { getQueue } = require('../utils/schedulerQueue');
    const queue = getQueue();
    
    const status = queue.getStatus();
    const stats = queue.getStats();
    
    res.json({
      ...status,
      stats
    });
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error getting queue status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear queue (emergency action)
 */
router.post('/queue/clear', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { getQueue } = require('../utils/schedulerQueue');
    const queue = getQueue();
    
    const clearedCount = queue.clear();
    
    console.log(`[SCHEDULER HEALTH] Queue cleared by admin user ${req.user.email || req.user._id} - ${clearedCount} jobs removed`);
    
    res.json({ 
      message: `Cleared ${clearedCount} jobs from queue`,
      clearedCount
    });
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error clearing queue:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get distributed lock status
 */
router.get('/lock', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const lockInfo = await SchedulerLock.getLockInfo();
    
    if (!lockInfo) {
      return res.json({
        held: false,
        message: 'No active lock'
      });
    }
    
    const now = new Date();
    const timeRemaining = lockInfo.expiresAt.getTime() - now.getTime();
    const timeSinceHeartbeat = now.getTime() - lockInfo.heartbeat.getTime();
    
    res.json({
      held: true,
      holder: lockInfo.holder,
      acquiredAt: lockInfo.acquiredAt,
      heartbeat: lockInfo.heartbeat,
      expiresAt: lockInfo.expiresAt,
      timeRemainingMs: Math.max(0, timeRemaining),
      timeSinceHeartbeatMs: timeSinceHeartbeat,
      isHealthy: timeSinceHeartbeat < 2 * 60 * 1000 // Heartbeat within 2 minutes
    });
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error getting lock status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Force release lock (emergency action)
 */
router.post('/lock/release', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { holder } = req.body;
    
    if (!holder) {
      return res.status(400).json({ error: 'holder parameter required' });
    }
    
    const released = await SchedulerLock.releaseLock('scheduler-main', holder);
    
    if (released) {
      console.log(`[SCHEDULER HEALTH] Lock released by admin user ${req.user.email || req.user._id} for holder: ${holder}`);
      res.json({ 
        message: 'Lock released successfully',
        holder
      });
    } else {
      res.status(404).json({ 
        error: 'Lock not found or not held by specified holder',
        holder
      });
    }
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error releasing lock:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cleanup expired locks
 */
router.post('/lock/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cleanedCount = await SchedulerLock.cleanupExpiredLocks();
    
    console.log(`[SCHEDULER HEALTH] Cleaned up ${cleanedCount} expired locks`);
    
    res.json({ 
      message: `Cleaned up ${cleanedCount} expired locks`,
      cleanedCount
    });
  } catch (error) {
    console.error('[SCHEDULER HEALTH] Error cleaning up locks:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
