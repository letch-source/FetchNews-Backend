/**
 * Scheduler Execution Model
 * Tracks scheduler executions for idempotency and monitoring
 */

const mongoose = require('mongoose');

const schedulerExecutionSchema = new mongoose.Schema({
  executionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  summaryId: {
    type: String,
    required: true
  },
  scheduledDate: {
    type: String, // YYYY-MM-DD format
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  duration: {
    type: Number // milliseconds
  },
  topics: [{
    type: String
  }],
  error: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800 // Auto-delete after 7 days
  }
});

// Compound index for quick lookups
schedulerExecutionSchema.index({ userId: 1, scheduledDate: 1, summaryId: 1 });
schedulerExecutionSchema.index({ status: 1, createdAt: -1 });

class SchedulerExecutionClass {
  /**
   * Create or get execution record (idempotency)
   * @param {string} userId
   * @param {string} summaryId
   * @param {string} scheduledDate - YYYY-MM-DD
   * @param {Array} topics
   * @returns {Promise<Object>} Execution record and isNew flag
   */
  static async getOrCreate(userId, summaryId, scheduledDate, topics = []) {
    const executionId = `${userId}-${summaryId}-${scheduledDate}`;
    
    // Try to find existing execution
    let execution = await this.findOne({ executionId });
    
    if (execution) {
      // Already exists - check if it's completed or running
      if (execution.status === 'completed') {
        return { execution, isNew: false, shouldExecute: false };
      }
      
      // If it's been running for more than 10 minutes, consider it stale
      const runningTooLong = execution.status === 'running' && 
        (Date.now() - execution.startedAt.getTime()) > 10 * 60 * 1000;
      
      if (runningTooLong) {
        console.log(`[IDEMPOTENCY] Execution ${executionId} stale (running > 10min), allowing retry`);
        execution.status = 'failed';
        execution.error = 'Timeout - exceeded 10 minutes';
        execution.retryCount += 1;
        await execution.save();
        
        // Create a new execution record for the retry
        execution = null;
      } else if (execution.status === 'running') {
        return { execution, isNew: false, shouldExecute: false };
      }
    }
    
    if (!execution) {
      // Create new execution
      execution = await this.create({
        executionId,
        userId,
        summaryId,
        scheduledDate,
        topics,
        status: 'pending'
      });
      return { execution, isNew: true, shouldExecute: true };
    }
    
    return { execution, isNew: false, shouldExecute: true };
  }
  
  /**
   * Mark execution as started
   */
  static async markStarted(executionId) {
    return await this.findOneAndUpdate(
      { executionId },
      {
        $set: {
          status: 'running',
          startedAt: new Date()
        }
      },
      { new: true }
    );
  }
  
  /**
   * Mark execution as completed
   */
  static async markCompleted(executionId) {
    const now = new Date();
    const execution = await this.findOne({ executionId });
    if (!execution) return null;
    
    execution.status = 'completed';
    execution.completedAt = now;
    execution.duration = now.getTime() - execution.startedAt.getTime();
    await execution.save();
    
    return execution;
  }
  
  /**
   * Mark execution as failed
   */
  static async markFailed(executionId, error) {
    const now = new Date();
    const execution = await this.findOne({ executionId });
    if (!execution) return null;
    
    execution.status = 'failed';
    execution.completedAt = now;
    execution.duration = now.getTime() - execution.startedAt.getTime();
    execution.error = error.toString();
    await execution.save();
    
    return execution;
  }
  
  /**
   * Get execution statistics
   */
  static async getStats(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const [total, completed, failed, running, avgDuration] = await Promise.all([
      this.countDocuments({ createdAt: { $gte: since } }),
      this.countDocuments({ status: 'completed', createdAt: { $gte: since } }),
      this.countDocuments({ status: 'failed', createdAt: { $gte: since } }),
      this.countDocuments({ status: 'running' }),
      this.aggregate([
        { $match: { status: 'completed', duration: { $exists: true }, createdAt: { $gte: since } } },
        { $group: { _id: null, avgDuration: { $avg: '$duration' } } }
      ])
    ]);
    
    return {
      total,
      completed,
      failed,
      running,
      pending: total - completed - failed - running,
      successRate: total > 0 ? (completed / total * 100).toFixed(1) + '%' : 'N/A',
      avgDuration: avgDuration[0]?.avgDuration ? Math.round(avgDuration[0].avgDuration) : 0
    };
  }
  
  /**
   * Get recent executions for monitoring
   */
  static async getRecent(limit = 10) {
    return await this.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'email')
      .lean();
  }
}

schedulerExecutionSchema.loadClass(SchedulerExecutionClass);

module.exports = mongoose.model('SchedulerExecution', schedulerExecutionSchema);
