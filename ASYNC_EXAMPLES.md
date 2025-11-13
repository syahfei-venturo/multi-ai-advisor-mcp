# Async Job System - Usage Examples

## Quick Start

### Example 1: Basic Query with Progress Tracking

```bash
# Step 1: Submit query job
query-models(question="What are the best practices for designing scalable APIs?")

# Response (immediate):
# Job ID: abc123def456
# Status: Pending
# Estimated Time: ~30.0s

# Step 2: Check progress after 10 seconds
get-job-progress(job_id="abc123def456")

# Response:
# ⏳ Job Progress: abc123def456
# - Status: running
# - Progress: 35%
# - Elapsed Time: 10.5s
# - Estimated Remaining: ~20.0s

# Step 3: Check again after 25 seconds total
get-job-progress(job_id="abc123def456")

# Response:
# ✅ Job Progress: abc123def456
# - Status: completed
# - Progress: 100%
# - Total Time: 30.2s

# Step 4: Retrieve full results
get-job-result(job_id="abc123def456")

# Response: [Full formatted response with all 3 models' answers]
```

---

## Example 2: Sequential Thinking Analysis

```
# Submit thinking analysis job
analyze-with-thinking(
  question="How would you design a distributed database system?",
  num_thinking_steps=7,
  session_id="design_discussion"
)

# Response (immediate):
# Job ID: xyz789abc012
# Status: Pending
# Estimated Time: ~42.0s

# Check progress immediately (should be pending)
get-job-progress(job_id="xyz789abc012")
# Response: Status: pending, Progress: 0%

# Wait a few seconds and check again
get-job-progress(job_id="xyz789abc012")
# Response: Status: running, Progress: 25%, Remaining: ~30s

# After ~45 seconds, check completion
get-job-progress(job_id="xyz789abc012")
# Response: Status: completed, Progress: 100%

# Get detailed thinking analysis results
get-job-result(job_id="xyz789abc012")
# Response: [Full response with thinking processes from 3 models]
```

---

## Example 3: Continuing Conversation with Session ID

```
# First query in new session
query-models(
  question="What is machine learning?",
  session_id="ml_discussion"
)
# → Job ID: job_001

get-job-result(job_id="job_001")
# → Responses saved with session_id="ml_discussion"

# Follow-up query using same session
query-models(
  question="How is deep learning different from traditional ML?",
  session_id="ml_discussion",
  include_history=true
)
# → Job ID: job_002
# → Models will have context from job_001

get-job-result(job_id="job_002")
# → Full response with context-aware answers
```

---

## Example 4: Batch Progress Polling

```
# Submit multiple queries at once
job1 = query-models(question="What is React?")       # job_111
job2 = query-models(question="What is Vue?")         # job_222
job3 = query-models(question="What is Angular?")     # job_333

# Poll all jobs
get-job-progress(job_id="job_111")
get-job-progress(job_id="job_222")
get-job-progress(job_id="job_333")

# Collect results when ready
# (Jobs may complete at different times)
job1_result = get-job-result(job_id="job_111")  # Might be ready
job2_result = get-job-result(job_id="job_222")  # Might still be pending
job3_result = get-job-result(job_id="job_333")  # Might still be pending

# Keep polling until all completed...
```

---

## Example 5: Error Handling

### Job Timeout

```
# Submit query
query-models(question="...")
# → Job ID: job_timeout

# Check progress after 45 seconds (exceeds default 30s timeout)
get-job-progress(job_id="job_timeout")

# Response:
# ❌ Job Progress: job_timeout
# - Status: failed
# - Progress: 60%
# - Error: Timeout after 30000ms

# Result attempt shows error
get-job-result(job_id="job_timeout")
# Response: ❌ Job failed with error: Timeout after 30000ms
```

### Model Unavailable

```
# If Ollama is down
query-models(question="...")
# → Job ID: job_error

# Job will fail
get-job-progress(job_id="job_error")
# - Status: failed
# - Error: Could not connect to Ollama (connection refused)

# Get result shows error
get-job-result(job_id="job_error")
# Response: ❌ Job failed with error: [error details]
```

---

## Example 6: Job Management

### List Active Jobs

```
list-jobs()

# Response:
# Job Queue Status
# 
# Statistics
# - Total Jobs: 5
# - Pending: 1
# - Running: 2
# - Completed: 2
# - Failed: 0
# - Cancelled: 0
# - Max Concurrent: 3
#
# Jobs
# [Detailed job list with all statuses]
```

### Cancel Running Job

```
# Cancel a job that's taking too long
cancel-job(job_id="job_abc123")

# Response:
# Job Cancelled
# Job ID: job_abc123
# Status: cancelled
# Cancelled at: 2025-11-13T10:35:20Z
```

---

## Example 7: System Monitoring

```
# Check system health (includes job queue stats)
health-check()

# Response includes:
# {
#   "status": "healthy",
#   "components": {
#     "jobQueue": {
#       "statistics": {
#         "total": 12,
#         "pending": 0,
#         "running": 2,
#         "completed": 10,
#         "failed": 0,
#         "cancelled": 0,
#         "maxConcurrent": 3
#       }
#     }
#   }
# }
```

---

## Example 8: Custom System Prompts with Async

```
analyze-with-thinking(
  question="Design a mobile app architecture",
  system_prompt="You are a mobile app architect with 10+ years experience",
  num_thinking_steps=8,
  enable_thinking=true
)

# → Job ID: job_design_001
# → Estimated: ~48s (3 models × 8 steps × ~2s per step)

# After thinking analysis completes:
get-job-result(job_id="job_design_001")
# → Each model's thinking process + final answer
```

---

## Example 9: Session Management

```
# View all active sessions
manage-conversation(action="list")

# Response:
# Active Conversation Sessions
# - session_1731405000000: 24 messages
# - session_design_discuss: 8 messages
# - session_ml_101: 12 messages

# View specific session
manage-conversation(
  session_id="session_design_discuss",
  action="view"
)

# Response: [Full conversation history with all messages]

# Clear session
manage-conversation(
  session_id="session_ml_101",
  action="clear"
)

# Response: ✓ Conversation history cleared for session ID: session_ml_101
```

---

## Real-World Scenarios

### Scenario A: Research Task

```
Researcher wants to gather perspectives on "Latest trends in AI safety"

1. Submit query job
   query-models(question="What are the latest trends in AI safety?")
   → Job: research_001

2. While waiting, continue other work
   [Do something else...]

3. Check progress occasionally
   get-job-progress(job_id="research_001")
   → Status: running, 60%, ~12s remaining

4. Get results when ready
   get-job-result(job_id="research_001")
   → Compile perspectives from 3 different models
   → Summarize findings
```

### Scenario B: Learning Path

```
Student wants to learn web development step-by-step

1. First lesson: Understanding HTTP
   query-models(
     question="Explain HTTP in simple terms for beginners",
     session_id="web_dev_course"
   )
   → Job: lesson_001

2. Get explanation
   get-job-result(job_id="lesson_001")

3. Follow-up question (context preserved)
   query-models(
     question="What are HTTP status codes?",
     session_id="web_dev_course",
     include_history=true
   )
   → Job: lesson_002
   → Models see previous discussion

4. Continue learning journey...
```

### Scenario C: Multi-Model Consensus

```
Need consensus on architectural decision

1. Submit query from multiple angles
   job1 = analyze-with-thinking(
     question="Why use microservices?",
     num_thinking_steps=5,
     session_id="arch_decision"
   )
   → Job: arch_001

2. Submit another perspective
   job2 = analyze-with-thinking(
     question="When NOT to use microservices?",
     num_thinking_steps=5,
     session_id="arch_decision"
   )
   → Job: arch_002

3. Monitor both jobs
   progress1 = get-job-progress(job_id="arch_001")
   progress2 = get-job-progress(job_id="arch_002")

4. Collect insights when both ready
   result1 = get-job-result(job_id="arch_001")
   result2 = get-job-result(job_id="arch_002")

5. Compare thinking processes and make decision
```

---

## Performance Characteristics

### Expected Timing

**Regular Query (3 models):**
- Submission to first progress: instant
- Initial estimate: 30s
- Actual time: 25-35s

**Thinking Analysis (3 models, 5 steps):**
- Submission to first progress: instant
- Initial estimate: 45s
- Actual time: 40-50s

**Adaptive Estimation:**
```
After 10% progress:
- Actual: 3s elapsed
- Estimate: 30s total → refined to 30s

After 50% progress:
- Actual: 15s elapsed
- Estimate: 30s total → might refine to 28-32s
- Remaining: ~13-17s
```

---

## Tips & Tricks

### 1. Efficient Polling Strategy

```
# Don't poll too aggressively (wastes resources)
# Poll every 2-5 seconds for best balance
get-job-progress(job_id="...")  # Check
wait(2000ms)                     # Wait
get-job-progress(job_id="...")  # Check again
```

### 2. Parallel Job Submission

```
# Submit all jobs quickly
jobs = [
  query-models(question="Q1"),
  query-models(question="Q2"),
  query-models(question="Q3"),
]

# Then poll periodically
for job_id in jobs:
  status = get-job-progress(job_id=job_id)
```

### 3. Result Caching

```
# Store results from important queries
job = query-models(question="Important question")
→ Store job_id: "important_q_001"

# If needed again, can retrieve from get-job-result
# without re-querying
```

### 4. Session Continuity

```
# Use meaningful session IDs for related queries
session_id="project_X_design_discussion"

query-models(
  question="Q1",
  session_id=session_id
)

query-models(
  question="Q2 (follow-up to Q1)",
  session_id=session_id,
  include_history=true
)

# Models have full context!
```

---

## Common Patterns

### Pattern 1: Fire and Forget

```
# Submit job and don't care about result yet
job_id = query-models(question="...")

# Come back later
result = get-job-result(job_id=job_id)
```

### Pattern 2: Wait for Completion

```
# Poll until done
while true:
  progress = get-job-progress(job_id=job_id)
  if progress.status == "completed":
    break
  wait(2s)

result = get-job-result(job_id=job_id)
```

### Pattern 3: Multiple Perspectives

```
# Get different angles simultaneously
jobs = [
  analyze-with-thinking(
    question="Topic from perspective A",
    num_thinking_steps=5
  ),
  analyze-with-thinking(
    question="Topic from perspective B",
    num_thinking_steps=5
  ),
]

# Wait for all, then compare
results = [get-job-result(id) for id in jobs]
```

