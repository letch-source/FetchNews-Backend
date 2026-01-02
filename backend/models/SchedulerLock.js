/**
 * Distributed Lock Model for Scheduler
 * Ensures only one server instance runs the scheduler at a time
 */

const mongoose = require('mongoose');

const schedulerLockSchema = new mongoose.Schema({
  lockId: {
    type: String,
    required: true,
    unique: true,
    default: 'scheduler-main'
  },
  holder: {
    type: String, // Server instance ID or hostname
    required: true
  },
  acquiredAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  heartbeat: {
    type: Date,
    default: Date.now
  }
});

// TTL index to auto-cleanup expired locks
schedulerLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

class SchedulerLockClass {
  /**
   * Try to acquire the scheduler lock
   * @param {string} lockId - Lock identifier (default: 'scheduler-main')
   * @param {string} holder - Server instance ID
   * @param {number} durationMs - Lock duration in milliseconds (default: 5 minutes)
   * @returns {Promise<boolean>} True if lock acquired, false otherwise
   */
  static async acquireLock(lockId = 'scheduler-main', holder, durationMs = 5 * 60 * 1000) {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMs);
      
      // Try to create a new lock
      const result = await this.findOneAndUpdate(
        {
          lockId,
          $or: [
            { expiresAt: { $lt: now } }, // Lock expired
            { holder } // We already hold the lock
          ]
        },
        {
          $set: {
            holder,
            acquiredAt: now,
            expiresAt,
            heartbeat: now
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
      
      return result !== null;
    } catch (error) {
      // Duplicate key error means another instance has the lock
      if (error.code === 11000) {
        return false;
      }
      throw error;
    }
  }
  
  /**
   * Release the scheduler lock
   * @param {string} lockId - Lock identifier
   * @param {string} holder - Server instance ID
   * @returns {Promise<boolean>} True if released, false if not held
   */
  static async releaseLock(lockId = 'scheduler-main', holder) {
    const result = await this.deleteOne({ lockId, holder });
    return result.deletedCount > 0;
  }
  
  /**
   * Update heartbeat to keep lock alive
   * @param {string} lockId - Lock identifier
   * @param {string} holder - Server instance ID
   * @param {number} extendMs - Extend expiration by this many ms
   * @returns {Promise<boolean>} True if heartbeat updated
   */
  static async heartbeat(lockId = 'scheduler-main', holder, extendMs = 5 * 60 * 1000) {
    const now = new Date();
    const result = await this.findOneAndUpdate(
      { lockId, holder, expiresAt: { $gt: now } },
      {
        $set: {
          heartbeat: now,
          expiresAt: new Date(now.getTime() + extendMs)
        }
      }
    );
    return result !== null;
  }
  
  /**
   * Check if a lock is currently held
   * @param {string} lockId - Lock identifier
   * @returns {Promise<Object|null>} Lock info or null
   */
  static async getLockInfo(lockId = 'scheduler-main') {
    const now = new Date();
    return await this.findOne({ 
      lockId,
      expiresAt: { $gt: now }
    }).lean();
  }
  
  /**
   * Force release all expired locks (cleanup)
   * @returns {Promise<number>} Number of locks cleaned up
   */
  static async cleanupExpiredLocks() {
    const result = await this.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    return result.deletedCount;
  }
}

schedulerLockSchema.loadClass(SchedulerLockClass);

module.exports = mongoose.model('SchedulerLock', schedulerLockSchema);
