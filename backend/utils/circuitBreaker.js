/**
 * Circuit Breaker Pattern
 * Prevents cascade failures by stopping operations after too many failures
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 1 minute
    this.resetTimeout = options.resetTimeout || 30 * 60 * 1000; // 30 minutes
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
  }
  
  /**
   * Execute a function through the circuit breaker
   */
  async execute(fn, fallback = null) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        console.log(`[CIRCUIT BREAKER] Circuit is OPEN, rejecting call. Next attempt in ${Math.round((this.nextAttempt - Date.now()) / 1000)}s`);
        
        if (fallback) {
          return await fallback();
        }
        
        throw new Error('Circuit breaker is OPEN - too many failures');
      } else {
        // Try to recover
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        console.log('[CIRCUIT BREAKER] Attempting recovery - state: HALF_OPEN');
      }
    }
    
    try {
      const result = await this.callWithTimeout(fn, this.timeout);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  /**
   * Call function with timeout
   */
  async callWithTimeout(fn, timeout) {
    return Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Circuit breaker timeout')), timeout)
      )
    ]);
  }
  
  /**
   * Handle successful execution
   */
  onSuccess() {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.lastStateChange = Date.now();
        console.log('[CIRCUIT BREAKER] Circuit CLOSED - recovered successfully');
      }
    }
  }
  
  /**
   * Handle failed execution
   */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      this.lastStateChange = Date.now();
      console.log(`[CIRCUIT BREAKER] Circuit OPEN again - recovery failed. Next attempt: ${new Date(this.nextAttempt).toISOString()}`);
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      this.lastStateChange = Date.now();
      console.error(`[CIRCUIT BREAKER] Circuit OPEN - ${this.failureCount} consecutive failures. Next attempt: ${new Date(this.nextAttempt).toISOString()}`);
    }
  }
  
  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      nextAttempt: this.state === 'OPEN' ? this.nextAttempt : null,
      timeUntilNextAttempt: this.state === 'OPEN' ? Math.max(0, this.nextAttempt - Date.now()) : 0
    };
  }
  
  /**
   * Force reset circuit breaker (admin override)
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    console.log('[CIRCUIT BREAKER] Manually reset to CLOSED state');
  }
  
  /**
   * Check if circuit is allowing requests
   */
  isAvailable() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'HALF_OPEN') return true;
    if (this.state === 'OPEN' && Date.now() >= this.nextAttempt) return true;
    return false;
  }
}

module.exports = CircuitBreaker;
