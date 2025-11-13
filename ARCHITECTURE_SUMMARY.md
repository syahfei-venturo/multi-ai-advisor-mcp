# Multi-Model Advisor - Architecture Summary (Quick Reference)

## 🎯 Project Overview

**Multi-Model Advisor** adalah MCP (Model Context Protocol) server yang mengintegrasikan Claude Desktop dengan multiple Ollama models, memberikan "council of advisors" approach.

```
User (Claude Desktop)
         ↓
    MCP Server (this project)
         ↓
    [Job Queue] → Async execution
         ↓
    Parallel Model Queries → [gemma3, llama3, deepseek]
         ↓
    Results + Conversation History
         ↓
    Claude synthesizes & responds
```

---

## 🏗️ Architecture at a Glance

### Components

| Component | File | Responsibility |
|-----------|------|-----------------|
| **MCP Server** | `index.ts` | Tool definitions, request handling, execution orchestration |
| **Job Queue** | `jobqueue.ts` | Async job submission, lifecycle management, concurrency control |
| **Database** | `database.ts` | SQLite persistence for conversations & jobs |
| **Configuration** | `config.ts` | CLI/env/defaults parsing, validation with Zod |
| **Retry Logic** | `retry.ts` | Circuit breaker, exponential backoff, error handling |

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SUBMISSION (Non-blocking)                                │
│                                                              │
│   query-models(question) → Create Job → Submit to Queue    │
│   Return Job ID immediately ✓                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. EXECUTION (Background)                                   │
│                                                              │
│   Job starts → Query models in parallel:                   │
│   • Model 1 with retry + circuit breaker                   │
│   • Model 2 with retry + circuit breaker                   │
│   • Model 3 with retry + circuit breaker                   │
│   Update progress continuously                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. PERSISTENCE (Real-time)                                  │
│                                                              │
│   Save to database: messages, job progress, results         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. RETRIEVAL (Poll-based)                                   │
│                                                              │
│   get-job-progress(job_id) → Current status & time estimate │
│   get-job-result(job_id) → Full results when ready ✓       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Job Queue System

### Lifecycle States

```
        ┌─────────────┐
        │   PENDING   │ (waiting in queue)
        └──────┬──────┘
               │ slot available
        ┌──────▼──────┐
        │   RUNNING   │ (executing)
        └──────┬──────┘
           ┌───┴────┬──────────┐
        ┌──▼──┐ ┌───▼────┐ ┌──▼────┐
        │DONE │ │ FAILED │ │CANCELLED
        └─────┘ └────────┘ └────────┘
```

### Configuration

```typescript
maxConcurrentJobs: 2         // Very conservative!
                             // Recommended: 5-10
```

### Progress Tracking

```
Start: [5%] Starting query...
       [15%] Querying model 1...
       [35%] Querying model 2...
       [65%] Querying model 3...
       [85%] Processing responses...
Done:  [100%] Completed!

Time Estimate:
- Initial: Based on model count (10s × 3 = 30s)
- Adaptive: Recalculates based on actual progress
```

---

## 💾 Database Schema

### Tables

```sql
conversations
├─ session_id (foreign key to sessions)
├─ message_index (order in conversation)
├─ role (user/assistant)
├─ content (message text)
├─ model_name (which model generated it)
└─ thinking_text (internal reasoning)

session_metadata
├─ session_id (primary key)
├─ created_at
├─ last_accessed (for cleanup)
└─ message_count

jobs
├─ id (primary key)
├─ type (query-models/analyze-thinking)
├─ status (pending/running/completed/failed)
├─ progress (0-100)
├─ input (serialized JSON)
└─ result (serialized JSON)

job_progress
├─ job_id (foreign key)
├─ timestamp
├─ message
└─ percentage
```

### Indexing Strategy

```
conversations:
  ✓ idx_session_id           (most queries)
  ✓ idx_session_created      (range queries)

session_metadata:
  ✓ idx_last_accessed        (cleanup queries)

jobs:
  ✓ idx_job_status           (status filtering)
  ✓ idx_job_created          (time-based queries)
```

**SQLite Mode:** WAL (Write-Ahead Logging) for better concurrency

---

## 🛡️ Error Handling

### Circuit Breaker

```
CLOSED (normal operation)
  │
  ├─ 5 failures occur
  │
  └─→ OPEN (reject requests)
       │
       └─ 60 seconds pass
          │
          └─→ HALF_OPEN (test recovery)
              │
              ├─ Request succeeds
              │  └─→ CLOSED ✓
              │
              └─ Request fails
                 └─→ OPEN
```

### Retry Mechanism

```
Attempt 1: ❌ wait 3000ms
Attempt 2: ❌ wait 6000ms
Attempt 3: ❌ wait 10000ms (capped)
Attempt 4: ❌ throw error

Total time: up to 19s for retries
```

### Supported Retry Conditions

```
✓ ECONNREFUSED (connection refused)
✓ ECONNRESET (connection reset)
✓ ETIMEDOUT (timeout)
✓ HTTP 502 (bad gateway)
✓ HTTP 503 (service unavailable)
✓ HTTP 504 (gateway timeout)
```

---

## ⚙️ Configuration System

### Precedence

```
CLI Arguments (highest)
    ↓
Environment Variables
    ↓
Default Values (lowest)
```

### Example Configurations

**Basic Start:**
```bash
npm start
# Uses .env or defaults
```

**Custom Models:**
```bash
node build/index.js \
  --models llama3:latest,neural-chat,mistral \
  --model1-prompt "You are funny" \
  --model2-prompt "You are helpful"
```

**Production Setup:**
```bash
OLLAMA_API_URL=http://remote:11434 \
MAX_CONCURRENT_JOBS=10 \
RETRY_MAX_ATTEMPTS=5 \
DEBUG=false \
node build/index.js
```

### Validation with Zod

```
✓ URL format validation
✓ Model list (at least 1)
✓ Bounds checking (concurrency: 1-100)
✓ Type checking
✗ Model availability check (todo)
✗ Ollama connectivity test (todo)
```

---

## 🔍 Strengths ✅

| Feature | Benefit |
|---------|---------|
| **Async Architecture** | Non-blocking, scalable |
| **Circuit Breaker** | Prevents cascading failures |
| **Exponential Backoff** | Intelligent retry strategy |
| **Persistent Storage** | Conversation history recovery |
| **Parallel Queries** | 3× faster than sequential |
| **Progress Tracking** | Real-time feedback |
| **Dynamic Prompts** | Different AI perspectives |
| **Health Checks** | System visibility |

---

## ⚠️ Weaknesses & TODOs ❌

| Issue | Severity | Impact | Fix |
|-------|----------|--------|-----|
| Max 2 concurrent jobs | 🔴 HIGH | Bottleneck | Set to 5-10 |
| Job progress not persisted | 🔴 HIGH | Loss on crash | Save to DB |
| Hardcoded 500s timeout | 🟡 MEDIUM | Inflexible | Make configurable |
| No auto cleanup | 🟡 MEDIUM | DB grows | Implement timer |
| No test coverage | 🔴 HIGH | Risky changes | Add tests |
| No rate limiting | 🟡 MEDIUM | Abuse risk | Implement bucket |
| Limited logging | 🟢 LOW | Debugging hard | Structured logs |
| No metrics | 🟢 LOW | No observability | Prometheus export |

---

## 🚀 Quick Start Performance

### Typical Timings

```
Submission:        < 10ms    (returns immediately)
Initial estimate:  30s       (3 models × 10s each)

Model queries:
  - Model 1:       8-12s     (parallel)
  - Model 2:       8-12s     (parallel)
  - Model 3:       8-12s     (parallel)
─────────────────────────
Total execution:   ~12s      (parallel wins!)

User polling: 100ms          (instant feedback)
```

### Resource Usage

```
Memory per session:
  - 40 messages max in memory
  - ~200KB for typical session
  - Total: < 50MB for 100 sessions

Database:
  - ~5KB per 100 messages
  - Grows linearly with usage
  - Needs manual cleanup (24-30 day retention recommended)
```

---

## 📊 Tools Available

| Tool | Purpose | Blocking | Response Time |
|------|---------|----------|----------------|
| `query-models` | Get multiple perspectives | No | Immediate (returns Job ID) |
| `analyze-with-thinking` | Deep analysis with reasoning | No | Immediate (returns Job ID) |
| `get-job-progress` | Check job status | Yes | Instant |
| `get-job-result` | Retrieve completed results | Yes | Instant (if ready) |
| `list-jobs` | See all jobs | Yes | Instant |
| `cancel-job` | Cancel pending job | Yes | Instant |
| `health-check` | System status | Yes | ~500ms |
| `manage-conversation` | View/clear history | Yes | Instant |

---

## 🔧 Recommended Improvements (Priority Order)

### Week 1 (Quick Wins)
- [ ] Increase `maxConcurrentJobs` from 2 → 5-10
- [ ] Make timeout configurable (not hardcoded 500s)
- [ ] Add auto-cleanup timer for database
- [ ] Persist job progress to database

### Week 2-3 (Stability)
- [ ] Comprehensive test suite (unit + integration)
- [ ] Implement rate limiting
- [ ] Add memory limits for in-memory history
- [ ] Implement proper job cancellation

### Month 2 (Observability)
- [ ] Structured logging (Winston/Pino)
- [ ] Metrics export (Prometheus)
- [ ] Distributed tracing support
- [ ] Better error messages

### Future (Advanced)
- [ ] Result streaming
- [ ] Job dependencies
- [ ] Model fallback chains
- [ ] WebSocket support

---

## 📚 File Reference

```
src/index.ts (500+ lines)
├─ MCP server setup
├─ Tool definitions (query-models, analyze-thinking, etc)
├─ Job execution handlers
├─ Conversation history management
└─ Request/response formatting

src/jobqueue.ts (300+ lines)
├─ Job class definition
├─ Queue management (pending/running/completed)
├─ Progress tracking
├─ Concurrency control
└─ Job lifecycle callbacks

src/database.ts (350+ lines)
├─ SQLite initialization
├─ Message persistence
├─ Job tracking
├─ Cleanup utilities
└─ Statistics reporting

src/config.ts (300+ lines)
├─ CLI argument parsing
├─ Environment variable loading
├─ Zod validation schema
├─ Default configuration
└─ Error reporting

src/retry.ts (200+ lines)
├─ Circuit breaker class
├─ Retry logic with exponential backoff
├─ Error classification
└─ Timeout handling
```

---

## 🎓 Key Learnings

1. **Non-blocking is Essential** - Async job submission prevents UI freezing
2. **Circuit Breakers Save Cascades** - Prevents system meltdown when Ollama is down
3. **Parallel > Sequential** - 3× speedup from parallel queries
4. **Persistence Matters** - Database recovery on restart builds confidence
5. **Configuration Flexibility** - CLI + env + defaults satisfies power users & ops
6. **Progress Feedback** - Users appreciate knowing how long things take
7. **Conservative is Safer** - But can hurt performance (need testing to scale)
8. **Validation Prevents Errors** - Zod catches issues early with good messages

---

## 🤔 Questions for Stakeholders

1. **Scale:** Are we targeting single-user or multi-user deployments?
2. **SLO:** What are the latency targets (e.g., < 20s for results)?
3. **Retention:** How long should conversation history be kept?
4. **Models:** Will we support > 3 models? Should they be discoverable?
5. **Observability:** Do we need metrics, logs, traces?
6. **Testing:** What's our test coverage goal?
7. **Deployment:** Docker? Kubernetes? Standalone?

---

## 📖 Next Steps

1. **Read Full Analysis:** `PROJECT_ARCHITECTURE_ANALYSIS.md`
2. **Review High-Priority Fixes:** Section 7.1
3. **Run Tests:** `npm test`
4. **Start Development:** Pick first issue to fix
5. **Monitor Performance:** Use health-check tool

---

**Last Updated:** November 13, 2025  
**Status:** Complete Analysis ✓  
**Ready for:** Development, Optimization, Testing
