# Scheduler Safeguards System

## Overview

Your scheduled fetch system now has **5 layers of protection** to prevent duplicate executions, handle failures gracefully, and provide visibility into scheduler health.

## 🛡️ Safeguards Implemented

### 1. **Distributed Lock** (Multi-Server Protection)
**Purpose**: Prevents multiple server instances from running the scheduler simultaneously

**How it works**:
- Uses MongoDB to maintain a distributed lock
- Only one server instance can hold the lock at a time
- Lock expires after 5 minutes (auto-cleanup if server crashes)
- Heartbeat every 2 minutes keeps lock alive
- Server identified by `RENDER_INSTANCE_ID` or hostname+PID

**Benefits**:
- ✅ Safe to scale horizontally (multiple Render instances)
- ✅ Automatic recovery if server crashes
- ✅ No duplicate executions across servers

**Model**: `/backend/models/SchedulerLock.js`

### 2. **Circuit Breaker** (Failure Protection)
**Purpose**: Stops scheduler after too many failures to prevent cascading issues

**States**:
- **CLOSED**: Normal operation (all requests allowed)
- **OPEN**: Too many failures (requests blocked for 30 minutes)
- **HALF_OPEN**: Testing recovery (limited requests allowed)

**Configuration**:
- Failure threshold: **5 consecutive failures** → Circuit OPEN
- Success threshold: **2 consecutive successes** → Circuit CLOSED
- Timeout per execution: **2 minutes**
- Reset timeout: **30 minutes** (circuit stays open)

**Benefits**:
- ✅ Protects against cascading failures
- ✅ Automatic recovery attempts
- ✅ Prevents wasted API calls when system is down
- ✅ Admin can manually reset circuit

**Implementation**: `/backend/utils/circuitBreaker.js`

### 3. **Idempotency Keys** (Duplicate Prevention)
**Purpose**: Ensures each scheduled fetch executes exactly once per day

**How it works**:
- Execution ID: `{userId}-{summaryId}-{date}`
- Tracks execution status: `pending`, `running`, `completed`, `failed`
- If execution already `completed` today → skip
- If execution `running` for >10 minutes → consider stale, allow retry
- Auto-cleanup after 7 days

**Benefits**:
- ✅ No duplicate fetches even with multiple scheduler checks
- ✅ Survives server restarts
- ✅ Handles stale "running" states
- ✅ Audit trail of all executions

**Model**: `/backend/models/SchedulerExecution.js`

### 4. **Queue System** (Orderly Processing)
**Purpose**: Processes scheduled fetches one at a time to prevent server overload

**How it works**:
- In-memory queue (survives across scheduler runs)
- Concurrency: **1** (processes one fetch at a time)
- Automatic retries: **1 retry** per failed execution
- Failed jobs retry immediately with higher priority

**Benefits**:
- ✅ Prevents server overload
- ✅ Fair processing (FIFO)
- ✅ Automatic retry logic
- ✅ Trackable queue status

**Implementation**: `/backend/utils/schedulerQueue.js`

### 5. **Health Monitoring** (Visibility)
**Purpose**: Provides real-time visibility into scheduler performance

**Available Endpoints** (Admin only):
- `GET /api/scheduler/health` - Overall health status
- `GET /api/scheduler/executions` - Recent execution history
- `GET /api/scheduler/stats` - Statistics (success rate, avg duration, etc.)
- `GET /api/scheduler/circuit-breaker` - Circuit breaker status
- `GET /api/scheduler/queue` - Queue status and backlog
- `GET /api/scheduler/lock` - Distributed lock status

**Admin Actions**:
- `POST /api/scheduler/circuit-breaker/reset` - Manually reset circuit
- `POST /api/scheduler/queue/clear` - Clear queue (emergency)
- `POST /api/scheduler/lock/release` - Force release lock
- `POST /api/scheduler/lock/cleanup` - Cleanup expired locks

**Routes**: `/backend/routes/schedulerHealth.js`

## 📊 How It All Works Together

```
┌─────────────────────────────────────────────────────────────┐
│                     Scheduler Check                          │
│                    (every 10 minutes)                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  Circuit Breaker  │──── OPEN? → Stop ✋
                  │     Check         │
                  └────────┬───────────┘
                           │ CLOSED/HALF_OPEN
                           ▼
                  ┌──────────────────┐
                  │ Distributed Lock  │──── Locked? → Stop ✋
                  │   Acquisition     │
                  └────────┬───────────┘
                           │ Acquired ✓
                           ▼
                  ┌──────────────────┐
                  │  Find Scheduled   │
                  │    Summaries      │
                  └────────┬───────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ Idempotency Check │──── Already done? → Skip ⏭️
                  │  (per summary)    │
                  └────────┬───────────┘
                           │ New execution ✓
                           ▼
                  ┌──────────────────┐
                  │  Add to Queue     │
                  │  (one at a time)  │
                  └────────┬───────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ Execute Through   │──── Fail? → Retry once
                  │ Circuit Breaker   │
                  └────────┬───────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ Track Execution   │──── Success/Failure
                  │    Status         │
                  └────────┬───────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  Release Lock     │
                  └───────────────────┘
```

## 🚀 Usage

### Normal Operation

Everything runs automatically! The safeguards are transparent:

```
[SCHEDULER] Acquired distributed lock for instance: render-xyz-123
[SCHEDULER] Found 3 users with scheduled summaries
[SCHEDULER] Queuing scheduled fetch "Daily Fetch" for user finlaysmith@gmail.com
[QUEUE] Processing job 68f16990-abc123-2026-01-03 (1 total, 0 remaining)
[SCHEDULER] Successfully executed scheduled fetch "Daily Fetch"
[SCHEDULER] Released distributed lock for instance: render-xyz-123
```

### Monitoring Health

#### Check Overall Health
```bash
curl https://your-backend.onrender.com/api/scheduler/health \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response**:
```json
{
  "status": "healthy",
  "healthScore": 95,
  "issues": [],
  "timestamp": "2026-01-03T12:00:00.000Z",
  "metrics": {
    "executions": {
      "total": 24,
      "completed": 23,
      "failed": 1,
      "running": 0,
      "successRate": "95.8%",
      "avgDuration": 3245
    },
    "circuitBreaker": {
      "state": "CLOSED",
      "failureCount": 0
    },
    "queue": {
      "queueLength": 0,
      "activeJobs": 0
    },
    "lock": {
      "holder": "render-xyz-123",
      "heartbeat": "2026-01-03T11:58:00.000Z"
    }
  }
}
```

#### Check Execution History
```bash
curl https://your-backend.onrender.com/api/scheduler/executions?limit=10 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### View Statistics
```bash
curl https://your-backend.onrender.com/api/scheduler/stats?hours=24 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Emergency Actions (Admin Only)

#### Reset Circuit Breaker
If circuit is stuck OPEN:
```bash
curl -X POST https://your-backend.onrender.com/api/scheduler/circuit-breaker/reset \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Clear Queue
If queue is backed up:
```bash
curl -X POST https://your-backend.onrender.com/api/scheduler/queue/clear \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Force Release Lock
If lock is held by dead instance:
```bash
curl -X POST https://your-backend.onrender.com/api/scheduler/lock/release \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"holder": "dead-instance-id"}'
```

## 📈 Performance Expectations

### Before Safeguards
- **Duplicate executions**: Possible with version conflicts
- **Cascading failures**: One failure could cause many
- **Visibility**: Limited (only logs)
- **Multi-server**: Not safe
- **Recovery**: Manual intervention required

### After Safeguards
- **Duplicate executions**: ✅ Impossible (idempotency)
- **Cascading failures**: ✅ Prevented (circuit breaker)
- **Visibility**: ✅ Full metrics and monitoring
- **Multi-server**: ✅ Safe to scale horizontally
- **Recovery**: ✅ Automatic with manual overrides

## 🔧 Configuration

### Environment Variables

```bash
# Scheduler enabled/disabled
SCHEDULER_ENABLED=true

# Server identification (auto-set by Render)
RENDER_INSTANCE_ID=your-instance-id

# MongoDB connection (required for distributed lock and idempotency)
MONGODB_URI=your-mongodb-uri
```

### Circuit Breaker Tuning

Edit `/backend/index.js`:

```javascript
const schedulerCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,        // Open after N failures
  successThreshold: 2,        // Close after N successes
  timeout: 120000,            // 2 min per execution
  resetTimeout: 30 * 60 * 1000 // Stay open for 30 min
});
```

### Queue Configuration

Edit `/backend/index.js`:

```javascript
const schedulerQueue = getQueue({ 
  concurrency: 1  // Process N jobs simultaneously
});
```

## 🐛 Troubleshooting

### Problem: Circuit Breaker Stuck OPEN
**Symptoms**: All scheduled fetches skipped, logs show "Circuit breaker is OPEN"

**Solution**:
1. Check recent errors: `GET /api/scheduler/executions?status=failed`
2. Fix underlying issue (API keys, database, etc.)
3. Reset circuit: `POST /api/scheduler/circuit-breaker/reset`

### Problem: Queue Backed Up
**Symptoms**: `queueLength` growing, fetches delayed

**Solution**:
1. Check queue status: `GET /api/scheduler/queue`
2. Check for slow executions in logs
3. If needed, clear queue: `POST /api/scheduler/queue/clear`

### Problem: Lock Not Released
**Symptoms**: Scheduler stops working, logs show "Could not acquire distributed lock"

**Solution**:
1. Check lock status: `GET /api/scheduler/lock`
2. If holder is dead (old heartbeat), force release
3. Or wait 5 minutes for auto-expiration

### Problem: Duplicate Executions
**Symptoms**: Users receive multiple summaries for same day

**Solution**:
1. Check execution logs: `GET /api/scheduler/executions`
2. Look for multiple `completed` entries for same date
3. This should not happen with idempotency - report as bug!

## 📝 Logging

Watch for these log patterns:

**Normal**:
```
[SCHEDULER] Acquired distributed lock for instance: xyz
[SCHEDULER] Queuing scheduled fetch "Daily Fetch"
[QUEUE] Processing job abc (1 total, 0 remaining)
[SCHEDULER] Successfully executed
[SCHEDULER] Released distributed lock
```

**Circuit Breaker**:
```
[CIRCUIT BREAKER] Circuit OPEN - 5 consecutive failures
[CIRCUIT BREAKER] Circuit CLOSED - recovered successfully
```

**Idempotency**:
```
[SCHEDULER] Execution already completed today (idempotency check)
```

**Queue**:
```
[QUEUE] Added job xyz to queue (position: 3)
[QUEUE] Retrying job xyz (attempt 1/1)
[QUEUE] Job xyz completed in 3245ms
```

## 🎯 Best Practices

1. **Monitor health weekly**: Check `/api/scheduler/health`
2. **Review failed executions**: Investigate any failures
3. **Check success rate**: Should be >95%
4. **Watch circuit breaker**: If opening frequently, investigate root cause
5. **Clean up old locks**: Run cleanup if locks accumulate
6. **Scale horizontally**: Safe to add multiple Render instances
7. **Emergency procedures**: Familiarize yourself with admin endpoints

## 📚 Related Documentation

- [SCHEDULED_FETCH_FIX.md](./SCHEDULED_FETCH_FIX.md) - Version conflict fix
- [CACHE_VERIFICATION_GUIDE.md](./CACHE_VERIFICATION_GUIDE.md) - Cache system
- [TESTING_GUIDE.md](./backend/TESTING_GUIDE.md) - Testing procedures

## 🎉 Summary

Your scheduler is now **production-grade** with:
- ✅ Zero duplicate executions (idempotency)
- ✅ Graceful failure handling (circuit breaker)
- ✅ Multi-server safety (distributed lock)
- ✅ Orderly processing (queue)
- ✅ Full visibility (health monitoring)
- ✅ Admin controls (emergency actions)

The system is resilient, scalable, and self-healing! 🚀
