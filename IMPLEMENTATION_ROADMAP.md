# Multi-Model Advisor - Implementation Roadmap

## Overview

Dokumen ini memberikan panduan implementasi konkret untuk meningkatkan Multi-Model Advisor berdasarkan analisis arsitektur.

---

## Priority 1: High Impact, Low Effort (Implement This Week)

### 1.1 Increase Default Concurrency

**Current State:**
```typescript
// config.ts - DEFAULT
maxConcurrentJobs: 2
```

**Issue:** Hanya 2 job dapat berjalan bersamaan. Jika ada 3 requests berturut-turut, request ke-3 harus menunggu request 1 selesai.

**Solution:**
```typescript
// config.ts
const getMaxConcurrentJobs = (): number => {
  const envValue = process.env.MAX_CONCURRENT_JOBS;
  const parsed = envValue ? parseInt(envValue, 10) : 5;  // Changed from 3
  
  if (isNaN(parsed) || parsed < 1) return 5;
  if (parsed > 100) return 100;
  
  return parsed;
};

export const jobQueue = new JobQueue(getMaxConcurrentJobs());
```

**Testing:**
```bash
# Test with default
npm start

# Test with custom value
MAX_CONCURRENT_JOBS=10 npm start
node build/index.js --max-concurrent-jobs 15
```

**Expected Impact:** 
- Reduce job queue wait time from ~10s to ~2-3s
- Better resource utilization
- No performance degradation with small concurrency values

---

### 1.2 Make Timeout Configurable

**Current State:**
```typescript
// index.ts - HARDCODED
const RETRY_CONFIG = {
  maxAttempts: 4,
  initialDelayMs: 3000,
  maxDelayMs: 10000,
  multiplier: 2,
  timeoutMs: 500000,  // ← 500 seconds, hardcoded!
};
```

**Issue:** Tidak bisa adjust untuk slow networks atau large models

**Solution:**

Step 1: Update config.ts
```typescript
// config.ts
jobQueue: z.object({
  maxConcurrentJobs: z.number().int().min(1).max(100),
  defaultRetryAttempts: z.number().int().min(1).max(10),
  defaultInitialDelayMs: z.number().int().min(100).max(10000),
  defaultMaxDelayMs: z.number().int().min(1000).max(60000),
  defaultTimeoutMs: z.number().int().min(30000).max(3600000),  // NEW
}).optional(),
```

Step 2: Add to getConfig()
```typescript
const getNumber = (cliKey: string, envKey: string, defaultValue: number) => {
  if (cliArgs[cliKey]) return parseInt(String(cliArgs[cliKey]), 10);
  const envValue = process.env[envKey];
  return envValue ? parseInt(envValue, 10) : defaultValue;
};

const jobQueueConfig = {
  // ... existing fields
  defaultTimeoutMs: getNumber('retry-timeout', 'RETRY_TIMEOUT_MS', 500000),
};
```

Step 3: Update config schema validation
```typescript
printConfigInfo(config) {
  console.error('⏱️  Timeout Configuration:');
  console.error(`  Retry Timeout: ${(config.jobQueue?.defaultTimeoutMs / 1000)}s`);
}
```

Step 4: Use in index.ts
```typescript
const RETRY_CONFIG = config.jobQueue ? {
  maxAttempts: config.jobQueue.defaultRetryAttempts,
  initialDelayMs: config.jobQueue.defaultInitialDelayMs,
  maxDelayMs: config.jobQueue.defaultMaxDelayMs,
  multiplier: 2,
  timeoutMs: config.jobQueue.defaultTimeoutMs,  // From config!
} : DEFAULT_RETRY_CONFIG;
```

**Testing:**
```bash
# Use defaults (500s)
npm start

# Override to 60s for fast networks
RETRY_TIMEOUT_MS=60000 npm start

# Via CLI
node build/index.js --retry-timeout 120000
```

---

### 1.3 Automatic Database Cleanup

**Current State:**
```typescript
// database.ts
deleteJobsByAge(hoursOld = 24): number { ... }
deleteSessionsByAge(days = 30): number { ... }
// These must be called manually!
```

**Solution:** Add background cleanup timer

```typescript
// NEW: Create file src/cleanup.ts
export class CleanupManager {
  private cleanupInterval: NodeJS.Timer | null = null;
  
  start(
    jobRetentionHours: number = 24,
    sessionRetentionDays: number = 30,
    cleanupIntervalHours: number = 6
  ) {
    this.cleanupInterval = setInterval(() => {
      this.runCleanup(jobRetentionHours, sessionRetentionDays);
    }, cleanupIntervalHours * 60 * 60 * 1000);
    
    console.error(`🧹 Cleanup manager started (runs every ${cleanupIntervalHours}h)`);
  }
  
  private runCleanup(jobRetentionHours: number, sessionRetentionDays: number) {
    const db = getDatabase();
    const timestamp = new Date().toISOString();
    
    try {
      const clearedJobs = db.deleteJobsByAge(jobRetentionHours);
      const clearedSessions = db.deleteSessionsByAge(sessionRetentionDays);
      
      if (clearedJobs > 0 || clearedSessions > 0) {
        console.error(JSON.stringify({
          timestamp,
          event: 'database_cleanup',
          jobs_deleted: clearedJobs,
          sessions_deleted: clearedSessions,
          retention: {
            jobs_hours: jobRetentionHours,
            sessions_days: sessionRetentionDays
          }
        }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        timestamp,
        event: 'database_cleanup_failed',
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }
  
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.error('🧹 Cleanup manager stopped');
    }
  }
}

export const cleanupManager = new CleanupManager();
```

```typescript
// index.ts - in main() after database init
const cleanupRetention = {
  jobHours: getNumber('job-retention-hours', 'JOB_RETENTION_HOURS', 24),
  sessionDays: getNumber('session-retention-days', 'SESSION_RETENTION_DAYS', 30),
  cleanupIntervalHours: getNumber('cleanup-interval-hours', 'CLEANUP_INTERVAL_HOURS', 6),
};

cleanupManager.start(
  cleanupRetention.jobHours,
  cleanupRetention.sessionDays,
  cleanupRetention.cleanupIntervalHours
);

process.on('SIGINT', () => {
  console.error('\n👋 Shutting down gracefully...');
  cleanupManager.stop();
  closeDatabase();
  process.exit(0);
});
```

**Configuration Options:**
```bash
JOB_RETENTION_HOURS=48          # Keep jobs for 2 days
SESSION_RETENTION_DAYS=60       # Keep sessions for 2 months
CLEANUP_INTERVAL_HOURS=12       # Run cleanup every 12 hours
```

**Testing:**
```typescript
// tests/cleanup.test.ts
describe('CleanupManager', () => {
  it('should delete old jobs', async () => {
    const manager = new CleanupManager();
    manager.start(1, 1, 0.1);  // Cleanup every 6 minutes
    
    await new Promise(r => setTimeout(r, 7 * 60 * 1000));  // Wait 7 min
    manager.stop();
    
    // Verify deletions
  });
});
```

---

### 1.4 Persist Job Progress to Database

**Current State:**
```typescript
// jobqueue.ts
updateProgress(jobId: string, progress: number, message: string) {
  const job = this.running.get(jobId);
  if (job) {
    job.progress = Math.min(100, Math.max(0, progress));
    job.progressUpdates.push({
      timestamp: new Date(),
      message,
      percentage: job.progress,
    });
    // ← NOT persisted to database!
  }
}
```

**Issue:** Jika server crash, progress updates hilang

**Solution:**

```typescript
// jobqueue.ts - modify updateProgress
updateProgress(jobId: string, progress: number, message: string): void {
  const job = this.running.get(jobId);
  if (job) {
    job.progress = Math.min(100, Math.max(0, progress));
    job.progressUpdates.push({
      timestamp: new Date(),
      message,
      percentage: job.progress,
    });
    
    // NEW: Persist to database
    try {
      const db = getDatabase();
      db.saveJobProgress(
        jobId,
        new Date(),
        message,
        job.progress
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: 'job_progress_save_failed',
        job_id: jobId,
        error: error instanceof Error ? error.message : String(error)
      }));
      // Don't fail job if DB is unavailable
    }
  }
}

// Also update in completeJob and failJob
completeJob(jobId: string, result: unknown): void {
  const job = this.running.get(jobId);
  if (job) {
    job.status = 'completed';
    job.progress = 100;
    job.completedAt = new Date();
    job.result = result;
    
    // NEW: Save final state to database
    try {
      const db = getDatabase();
      db.saveJob(job);
    } catch (error) {
      console.error('Failed to save job to database:', error);
    }
    
    this.running.delete(jobId);
    this.completed.set(jobId, job);
    this.processQueue();
  }
}
```

**Benefits:**
- Job progress persists across server restarts
- Better debugging of long-running jobs
- Historical job data for analytics

---

## Priority 2: Medium Impact, Medium Effort (This Month)

### 2.1 Comprehensive Test Coverage

**Current State:**
```
tests/
├── database.test.ts       (stub, ~50 lines)
├── jobqueue.test.ts       (stub, ~50 lines)
└── retry.test.ts          (stub, ~50 lines)
Total: ~150 lines, minimal coverage
```

**Create test for Job Queue:**

```typescript
// tests/jobqueue.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { JobQueue } from '../src/jobqueue';

describe('JobQueue', () => {
  let queue: JobQueue;
  
  beforeEach(() => {
    queue = new JobQueue(2);  // Max 2 concurrent
  });
  
  it('should create job with correct initial state', () => {
    const jobId = queue.submitJob(
      'query-models',
      { question: 'test' },
      30000,
      3
    );
    
    const job = queue.getJobStatus(jobId);
    expect(job).toBeDefined();
    expect(job?.status).toBe('pending');
    expect(job?.progress).toBe(0);
  });
  
  it('should process pending jobs when slots available', (done) => {
    let executedJobId = '';
    queue.onJobStarted_attach((job) => {
      executedJobId = job.id;
      queue.completeJob(job.id, { result: 'done' });
    });
    
    const jobId = queue.submitJob('query-models', {}, 1000, 3);
    
    setTimeout(() => {
      expect(executedJobId).toBe(jobId);
      expect(queue.getJobStatus(jobId)?.status).toBe('completed');
      done();
    }, 100);
  });
  
  it('should respect maxConcurrent limit', (done) => {
    const executed: string[] = [];
    queue.onJobStarted_attach((job) => {
      executed.push(job.id);
      // Simulate long-running job
    });
    
    // Submit 5 jobs, but max is 2
    const jobIds = [];
    for (let i = 0; i < 5; i++) {
      jobIds.push(queue.submitJob('query-models', {}, 10000, 3));
    }
    
    setTimeout(() => {
      // Only first 2 should have started
      expect(executed.length).toBe(2);
      expect(executed).toEqual([jobIds[0], jobIds[1]]);
      done();
    }, 100);
  });
  
  it('should track progress updates', (done) => {
    const jobId = queue.submitJob('query-models', {}, 10000, 3);
    
    queue.onJobStarted_attach((job) => {
      queue.updateProgress(job.id, 25, 'Step 1');
      queue.updateProgress(job.id, 50, 'Step 2');
      
      const updated = queue.getJobStatus(job.id);
      expect(updated?.progress).toBe(50);
      expect(updated?.progressUpdates.length).toBe(2);
      done();
    });
  });
  
  it('should cancel pending jobs', () => {
    const jobId = queue.submitJob('query-models', {}, 10000, 3);
    
    const success = queue.cancelJob(jobId);
    expect(success).toBe(true);
    
    const job = queue.getJobStatus(jobId);
    expect(job?.status).toBe('cancelled');
  });
  
  it('should fail jobs with error message', (done) => {
    const jobId = queue.submitJob('query-models', {}, 10000, 3);
    
    queue.onJobStarted_attach((job) => {
      queue.failJob(job.id, 'Model timeout');
      
      const failed = queue.getJobStatus(job.id);
      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('Model timeout');
      done();
    });
  });
});
```

**Create integration test:**

```typescript
// tests/integration.test.ts
describe('Multi-Model Advisor - Integration', () => {
  it('should handle full query-models flow', async () => {
    // Mock Ollama API
    // Submit query
    // Check progress
    // Retrieve results
    // Verify database persistence
  });
  
  it('should recover incomplete jobs on restart', async () => {
    // Start server
    // Submit job
    // Simulate crash
    // Restart server
    // Verify job resubmitted
  });
  
  it('should handle circuit breaker correctly', async () => {
    // Simulate Ollama failures
    // Trigger circuit breaker
    // Verify fast-fail behavior
    // Verify recovery
  });
});
```

---

### 2.2 Structured Logging

**Current:**
```typescript
console.error("Error saving user message to database:", dbError);
console.error(JSON.stringify({ ... }));  // Inconsistent
```

**Recommended: Winston Logger**

```typescript
// src/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'multi-model-advisor' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log'
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}
```

**Usage:**
```typescript
logger.info('Job submitted', { jobId, modelCount });
logger.error('Model query failed', { jobId, model, error });
logger.debug('Progress updated', { jobId, progress, message });
```

---

### 2.3 Rate Limiting

**Token Bucket Algorithm:**

```typescript
// src/ratelimit.ts
export class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;
  
  constructor(
    private capacity: number,
    private refillRate: number  // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }
  
  async acquire(tokensNeeded: number = 1): Promise<void> {
    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = elapsedSec * this.refillRate;
    
    this.tokens = Math.min(
      this.capacity,
      this.tokens + tokensToAdd
    );
    this.lastRefillTime = now;
    
    // Wait if not enough tokens
    while (this.tokens < tokensNeeded) {
      const waitMs = ((tokensNeeded - this.tokens) / this.refillRate) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      
      // Refill again after waiting
      const now = Date.now();
      const elapsedSec = (now - this.lastRefillTime) / 1000;
      this.tokens += elapsedSec * this.refillRate;
      this.lastRefillTime = now;
    }
    
    this.tokens -= tokensNeeded;
  }
}
```

**Usage in tools:**

```typescript
// index.ts
const jobRateLimiter = new TokenBucket(100, 10);  // 100 max, 10 per sec

server.tool('query-models', ..., async (input) => {
  await jobRateLimiter.acquire(1);  // Acquire 1 token
  
  const jobId = jobQueue.submitJob(...);
  // ...
});
```

---

## Priority 3: Low Priority (Future)

### 3.1 Metrics & Observability

Use Prometheus format:
```typescript
// src/metrics.ts
const jobCounter = new Counter(
  'jobs_total',
  'Total jobs submitted',
  { labels: ['type', 'status'] }
);

const jobDuration = new Histogram(
  'job_duration_ms',
  'Job execution duration'
);

const queueSize = new Gauge(
  'queue_size_pending',
  'Number of pending jobs'
);
```

### 3.2 Streaming Results

Instead of buffering full results, stream as models complete:
```typescript
server.tool('query-models-streaming', ..., async (input) => {
  // Return results progressively
  // Requires MCP protocol updates
});
```

### 3.3 Model Fallback Chain

If primary model fails, automatically try secondary:
```typescript
const modelChain = [
  ['gemma3:1b', 'llama3:latest'],     // Try llama if gemma fails
  ['llama3.2:1b', 'mistral:latest'],
  ['deepseek-r1:1.5b', 'neural-chat'],
];
```

---

## Implementation Timeline

```
Week 1:
  Mon: Increase concurrency + make timeout configurable
  Tue: Add auto cleanup
  Wed: Persist job progress
  Thu: Integration testing
  Fri: Deploy & monitor

Week 2-3:
  Comprehensive test coverage
  Structured logging
  Rate limiting
  Performance testing

Month 2:
  Metrics & observability
  Advanced features (streaming, fallback, etc)
```

---

## Testing Before & After

### Before Improvements:
```
Concurrency: 2 jobs
Queue wait: ~15s (job 3 waits for job 1)
Timeout: Fixed 500s (hardcoded)
Cleanup: Manual (database grows)
Progress: Lost on restart
Tests: ~30% coverage
```

### After Improvements:
```
Concurrency: 5-10 jobs
Queue wait: ~2-3s
Timeout: Configurable per deployment
Cleanup: Automatic (runs every 6h)
Progress: Persisted to database
Tests: ~80%+ coverage
```

---

## Success Metrics

- ✅ 90th percentile job latency < 20s
- ✅ Database size stays under 1GB (with cleanup)
- ✅ Zero job loss on restarts
- ✅ Test coverage > 80%
- ✅ All configuration errors caught at startup
- ✅ Zero rate-limit abuse

---

## Questions & Considerations

1. **Backwards Compatibility:** Do we need to maintain API compatibility?
2. **Deployment:** Will this run in Docker/K8s? Affects logging, cleanup strategy
3. **Multi-Server:** Will multiple servers share a database? Needs distributed locks
4. **Retention Policy:** What's the organization's policy on data retention?
5. **Compliance:** Any GDPR/compliance requirements for conversation history?

---

**Document Version:** 1.0  
**Created:** November 13, 2025  
**Status:** Ready for Implementation
