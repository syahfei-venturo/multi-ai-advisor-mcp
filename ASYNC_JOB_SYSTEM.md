# Async Job System Documentation

## Overview

Sistem telah dimodifikasi untuk menggunakan **async job submission** model. Tools `query-models` dan `analyze-with-thinking` sekarang mengembalikan respons secara **non-blocking**, memungkinkan agent untuk check progress dan retrieve hasil saat sudah siap.

## Architecture

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Agent / Client                                                   │
└─────────────────────────────────────────────────────────────────┘
    │
    ├─ 1. Call query-models() or analyze-with-thinking()
    │      ↓
    │   Tool returns: Job ID + Progress Estimation (IMMEDIATE)
    │
    ├─ 2. Call get-job-progress(job_id) multiple times
    │      ↓
    │   Tool returns: Current progress, elapsed time, estimated remaining
    │
    └─ 3. When status = "completed", call get-job-result(job_id)
         ↓
      Tool returns: Full results (formatted response)
```

## Tools

### 1. query-models (Async Submission)

**Parameters:**
- `question` (string, required) - Question untuk semua models
- `system_prompt` (string, optional) - System prompt untuk semua models
- `model_system_prompts` (object, optional) - Model-specific prompts
- `session_id` (string, optional) - Session ID untuk conversation history
- `include_history` (boolean, default: true) - Include previous messages
- `enable_thinking` (boolean, default: false) - Use sequential thinking

**Response (Immediate):**
```
Job ID: abc123def456
Status: Pending
Models to Query: 3
Estimated Time: ~30.0s

Next Steps:
1. get-job-progress(job_id="abc123def456")
2. Wait for status = "completed"
3. get-job-result(job_id="abc123def456")
```

---

### 2. analyze-with-thinking (Async Submission)

**Parameters:**
- `question` (string, required) - Problem untuk dianalisis
- `system_prompt` (string, optional) - System prompt override
- `model_system_prompts` (object, optional) - Model-specific prompts
- `session_id` (string, optional) - Session ID untuk conversation
- `num_thinking_steps` (number, default: 5) - Jumlah thinking steps
- `include_history` (boolean, default: true) - Include previous messages

**Response (Immediate):**
```
Job ID: xyz789abc012
Status: Pending
Models to Analyze: 3
Thinking Steps: 5
Estimated Time: ~45.0s

Next Steps:
1. get-job-progress(job_id="xyz789abc012")
2. Wait for status = "completed"
3. get-job-result(job_id="xyz789abc012")
```

---

### 3. get-job-progress (Status Check)

**Parameters:**
- `job_id` (string, required) - Job ID dari submission

**Response:**
```
✅ Job Progress: abc123def456

Status
- Type: query-models
- Status: running
- Progress: 45%
- Models: 3

Time Information
- Created: 2025-11-13T10:30:00Z
- Started: 2025-11-13T10:30:02Z
- Completed: In progress
- Elapsed Time: 15.5s
- Estimated Remaining: ~15.0s
- Total Estimated: ~30.0s

Progress Updates
- [5%] 10:30:02Z: Starting query for 3 models...
- [10%] 10:30:03Z: Querying gemma3:1b...
- [15%] 10:30:08Z: Querying llama3.2:1b...
- [45%] 10:30:18Z: Querying deepseek-r1:1.5b...
```

---

### 4. get-job-result (Result Retrieval)

**Parameters:**
- `job_id` (string, required) - Job ID dari submission

**Response (ketika job completed):**
```
# Responses from Multiple Models

**Session ID**: `session_1731405000000`

## GEMMA3:1B RESPONSE:
[Full model response...]

## LLAMA3.2:1B RESPONSE:
[Full model response...]

## DEEPSEEK-R1:1.5B RESPONSE:
[Full model response...]
```

**Response (jika job masih in-progress):**
```
⏳ Job is still in progress (Status: running, Progress: 45%)

Use `get-job-progress` to check the current status:
```

**Response (jika job failed):**
```
❌ Job failed with error:

Timeout after 30000ms
```

---

## Usage Example

### Scenario 1: Sequential Usage Pattern

```
# Step 1: Submit query job
Agent: query-models(question="What are best practices in software architecture?")
Response: 
  Job ID: job_abc123
  Estimated Time: 30s

# Step 2: Check progress (immediate)
Agent: get-job-progress(job_id="job_abc123")
Response:
  Status: pending
  Progress: 0%
  Estimated: 30s

# Step 3: Check progress again after 15s
Agent: get-job-progress(job_id="job_abc123")
Response:
  Status: running
  Progress: 50%
  Estimated Remaining: 15s

# Step 4: Get results (after 30s)
Agent: get-job-progress(job_id="job_abc123")
Response:
  Status: completed
  Progress: 100%

# Step 5: Retrieve full results
Agent: get-job-result(job_id="job_abc123")
Response: [Full formatted response with all model outputs]
```

---

### Scenario 2: Polling Pattern (for automated checks)

```typescript
// Pseudo-code untuk polling
async function waitForJobCompletion(jobId: string, maxWaitMs: number = 120000) {
  const startTime = Date.now();
  const pollIntervalMs = 2000; // Check setiap 2 detik

  while (Date.now() - startTime < maxWaitMs) {
    const progress = await getJobProgress(jobId);
    
    if (progress.status === 'completed') {
      const result = await getJobResult(jobId);
      return result;
    }
    
    if (progress.status === 'failed') {
      throw new Error(`Job failed: ${progress.error}`);
    }
    
    // Sleep sebelum polling berikutnya
    await sleep(pollIntervalMs);
  }
  
  throw new Error(`Job timeout after ${maxWaitMs}ms`);
}
```

---

## Implementation Details

### Job Submission Flow

1. **Tool Handler** (query-models/analyze-with-thinking)
   - Validate input parameters
   - Hitung estimasi waktu berdasarkan:
     - Jumlah models
     - Mode (thinking vs regular)
     - Thinking steps count (jika applicable)
   - Submit job ke queue dengan `jobQueue.submitJob()`
   - Return Job ID + progress estimation (IMMEDIATELY)

2. **Job Queue** (jobqueue.ts)
   - Simpan job dengan status `pending`
   - Update `estimatedCompletionMs` dan `estimatedTotalMs`
   - Trigger process queue

3. **Job Execution** (background)
   - Job handler dipanggil via `onJobStarted` callback
   - Update progress secara periodic
   - Jalankan actual queries
   - Save hasil ke job.result
   - Mark job sebagai `completed`

### Time Estimation Algorithm

```typescript
// Initial estimate saat submission
estimatedTotalMs = modelsCount * baseTimePerModel;
// Untuk thinking: +3000ms per thinking step
// Untuk regular: baseTimePerModel = 10000ms

// Adaptive estimation saat execution
if (elapsedMs > 0 && progress > 1%) {
  estimatedTotalMs = elapsedMs / (progress / 100);
  estimatedCompletionMs = estimatedTotalMs - elapsedMs;
}
```

### Progress Tracking

Setiap update progress:
- Increment persentase
- Add progress update dengan timestamp
- Recalculate estimated remaining time
- Store di job object

---

## API Changes Summary

### Removed Blocking Behavior
- ❌ query-models() NO LONGER blocks waiting for results
- ❌ analyze-with-thinking() NO LONGER blocks waiting for results
- ✅ Both return Job ID immediately

### New Tools
- ✅ get-job-result(job_id) - Retrieve completed job results
- ✅ get-job-progress(job_id) - ENHANCED dengan time estimation

### Enhanced Job Queue
- ✅ estimatedCompletionMs - Estimasi waktu sisa
- ✅ estimatedTotalMs - Total estimasi waktu
- ✅ modelCount - Jumlah models yang diquery
- ✅ getJobDetails() - Quick job info retrieval

---

## Benefits

### 1. Better User Experience
- ✅ Immediate feedback (bukan waiting)
- ✅ Real-time progress tracking
- ✅ Accurate time estimation
- ✅ Can cancel jobs if needed

### 2. Scalability
- ✅ Non-blocking: handle multiple concurrent queries
- ✅ Better resource utilization
- ✅ No timeout issues untuk long-running queries

### 3. Flexibility
- ✅ Agent dapat melakukan task lain sambil menunggu
- ✅ Intelligent retry/backoff strategies
- ✅ Graceful degradation

---

## Error Handling

### Job Failure Scenarios

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| Model timeout | Mark job as failed | Retry via cancel + resubmit |
| Circuit breaker open | Continue, return error response | Auto-recover when service back |
| Database error | Log warning, continue in-memory | Graceful degradation |
| All models failed | Mark job as completed with error info | Agent can retry |

---

## Performance Characteristics

### Estimation Accuracy

```
Mode: Regular Query
- 3 models: ~30s
- 5 models: ~50s
- Formula: 10s per model

Mode: Thinking Analysis
- 3 models, 5 steps: ~45s
- 3 models, 10 steps: ~60s
- Formula: (5s + 3s per step) per model
```

### Memory Usage

- **Per Job**: ~5-10KB in-memory + result size
- **Max Jobs in-memory**: Configurable (default: 3 concurrent)
- **Completed Jobs**: Kept for 24 hours (configurable cleanup)

---

## Configuration

Environment variables:

```bash
# Job queue settings
MAX_CONCURRENT_JOBS=3
RETRY_MAX_ATTEMPTS=4
RETRY_INITIAL_DELAY_MS=1000
RETRY_MAX_DELAY_MS=8000

# Timeout settings
# (Currently hardcoded as 30s in RETRY_CONFIG.timeoutMs)
```

---

## Migration Guide

### From Old Blocking API to New Async API

**Before (Blocking):**
```
# Single call, waiting ~30 seconds
query-models(question="...") 
  → [Full response after ~30s]
```

**After (Async):**
```
# Step 1: Submit (immediate)
query-models(question="...")
  → Job ID: abc123

# Step 2: Poll progress (immediate)
get-job-progress(job_id="abc123")
  → Status: running, 50%, ~15s remaining

# Step 3: Get result (immediate)
get-job-result(job_id="abc123")
  → [Full response if completed]
```

---

## Troubleshooting

### Job stuck in "pending" status

**Symptom**: Job tidak pernah mulai

**Cause**: Queue full atau job handler error

**Solution**: 
```
1. Check get-job-progress untuk error messages
2. Check list-jobs untuk queue statistics
3. Cancel job dan resubmit
```

### Timeout saat execution

**Symptom**: Job status berubah ke "failed", error "Timeout after 30000ms"

**Cause**: Model lambat atau offline

**Solution**:
```
1. Check health-check untuk model status
2. Reduce model count atau restart Ollama
3. Increase RETRY_MAX_DELAY_MS jika diperlukan
```

---

## Future Enhancements

1. **Streaming Results**: Return partial results saat available
2. **Job Prioritization**: Priority queue untuk urgent jobs
3. **Batch Submission**: Submit multiple jobs di satu call
4. **Result Caching**: Cache hasil untuk identical queries
5. **Metrics Export**: Prometheus-style metrics untuk monitoring

