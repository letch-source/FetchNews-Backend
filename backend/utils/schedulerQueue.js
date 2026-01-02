/**
 * Simple In-Memory Queue for Scheduled Fetch Executions
 * Processes fetches one at a time to prevent overload
 */

const EventEmitter = require('events');

class SchedulerQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.queue = [];
    this.processing = false;
    this.concurrency = options.concurrency || 1; // Process one at a time by default
    this.activeJobs = 0;
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      totalSuccess: 0,
      lastProcessedAt: null
    };
  }
  
  /**
   * Add a job to the queue
   * @param {Object} job - Job details
   * @returns {Promise} Resolves when job is processed
   */
  async add(job) {
    return new Promise((resolve, reject) => {
      const queuedJob = {
        ...job,
        id: job.id || `${job.userId}-${Date.now()}`,
        addedAt: Date.now(),
        resolve,
        reject,
        retries: job.retries || 0,
        maxRetries: job.maxRetries || 2
      };
      
      this.queue.push(queuedJob);
      this.emit('job:added', queuedJob);
      
      console.log(`[QUEUE] Added job ${queuedJob.id} to queue (position: ${this.queue.length})`);
      
      // Start processing if not already processing
      this.process();
    });
  }
  
  /**
   * Process jobs in the queue
   */
  async process() {
    if (this.processing) return;
    if (this.activeJobs >= this.concurrency) return;
    if (this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0 && this.activeJobs < this.concurrency) {
      const job = this.queue.shift();
      this.activeJobs++;
      
      // Process job asynchronously
      this.processJob(job).finally(() => {
        this.activeJobs--;
        // Check if there are more jobs to process
        if (this.queue.length > 0) {
          this.process();
        }
      });
    }
    
    this.processing = false;
  }
  
  /**
   * Process a single job
   */
  async processJob(job) {
    const startTime = Date.now();
    console.log(`[QUEUE] Processing job ${job.id} (${this.stats.totalProcessed + 1} total, ${this.queue.length} remaining)`);
    
    this.emit('job:started', job);
    
    try {
      // Execute the job function
      const result = await job.execute();
      
      const duration = Date.now() - startTime;
      console.log(`[QUEUE] Job ${job.id} completed in ${duration}ms`);
      
      this.stats.totalProcessed++;
      this.stats.totalSuccess++;
      this.stats.lastProcessedAt = Date.now();
      
      this.emit('job:completed', { job, result, duration });
      job.resolve(result);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[QUEUE] Job ${job.id} failed after ${duration}ms:`, error.message);
      
      // Retry logic
      if (job.retries < job.maxRetries) {
        job.retries++;
        console.log(`[QUEUE] Retrying job ${job.id} (attempt ${job.retries}/${job.maxRetries})`);
        
        // Add back to queue with higher priority (front of queue)
        this.queue.unshift(job);
        
        this.emit('job:retry', { job, error, attempt: job.retries });
      } else {
        // Max retries exceeded
        this.stats.totalProcessed++;
        this.stats.totalFailed++;
        this.stats.lastProcessedAt = Date.now();
        
        this.emit('job:failed', { job, error, duration });
        job.reject(error);
      }
    }
  }
  
  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      activeJobs: this.activeJobs,
      processing: this.processing,
      concurrency: this.concurrency,
      stats: this.stats,
      nextJob: this.queue[0] ? {
        id: this.queue[0].id,
        userId: this.queue[0].userId,
        addedAt: this.queue[0].addedAt,
        waitTime: Date.now() - this.queue[0].addedAt
      } : null
    };
  }
  
  /**
   * Clear the queue
   */
  clear() {
    const clearedCount = this.queue.length;
    
    // Reject all pending jobs
    for (const job of this.queue) {
      job.reject(new Error('Queue cleared'));
    }
    
    this.queue = [];
    console.log(`[QUEUE] Cleared ${clearedCount} jobs from queue`);
    
    this.emit('queue:cleared', clearedCount);
    return clearedCount;
  }
  
  /**
   * Pause queue processing
   */
  pause() {
    this.concurrency = 0;
    console.log('[QUEUE] Queue paused');
    this.emit('queue:paused');
  }
  
  /**
   * Resume queue processing
   */
  resume() {
    this.concurrency = 1;
    console.log('[QUEUE] Queue resumed');
    this.emit('queue:resumed');
    this.process();
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalProcessed > 0 
        ? ((this.stats.totalSuccess / this.stats.totalProcessed) * 100).toFixed(1) + '%'
        : 'N/A'
    };
  }
}

// Singleton instance
let queueInstance = null;

module.exports = {
  SchedulerQueue,
  getQueue: (options) => {
    if (!queueInstance) {
      queueInstance = new SchedulerQueue(options);
    }
    return queueInstance;
  }
};
