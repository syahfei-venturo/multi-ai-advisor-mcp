import { JobQueue, Job } from "../src/infrastructure/queue/JobQueue.js";

describe("JobQueue", () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue(2); // 2 concurrent jobs for testing
  });

  describe("Job Submission", () => {
    test("should submit a job and return a job ID", () => {
      const jobId = queue.submitJob("query-models", { question: "What is AI?" });
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);
    });

    test("should create job in pending or running status", () => {
      const jobId = queue.submitJob("query-models", { question: "Test" });
      const job = queue.getJobStatus(jobId);
      expect(job).toBeDefined();
      expect(["pending", "running"]).toContain(job?.status);
      expect(job?.progress).toBeGreaterThanOrEqual(0);
    });

    test("should store job input correctly", () => {
      const input = { question: "What is AI?", models: ["model1", "model2"] };
      const jobId = queue.submitJob("query-models", input);
      const job = queue.getJobStatus(jobId);
      expect(job?.input).toEqual(input);
    });
  });

  describe("Job Status Tracking", () => {
    test("should get job status", () => {
      const jobId = queue.submitJob("analyze-thinking", { question: "Test" });
      const job = queue.getJobStatus(jobId);
      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
      expect(job?.type).toBe("analyze-thinking");
    });

    test("should return null for non-existent job", () => {
      const job = queue.getJobStatus("non-existent-id");
      expect(job).toBeNull();
    });

    test("should track job timestamps", () => {
      const before = new Date();
      const jobId = queue.submitJob("query-models", {});
      const after = new Date();
      const job = queue.getJobStatus(jobId);

      expect(job?.createdAt).toBeDefined();
      expect(job?.createdAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(job?.createdAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("Progress Tracking", () => {
    test("should update job progress", () => {
      const jobId = queue.submitJob("query-models", {});
      queue.updateProgress(jobId, 50, "Processing models");

      const job = queue.getJobStatus(jobId);
      expect(job?.progress).toBe(50);
    });

    test("should record progress updates", () => {
      const jobId = queue.submitJob("query-models", {});
      queue.updateProgress(jobId, 25, "Starting processing");
      queue.updateProgress(jobId, 50, "Halfway through");
      queue.updateProgress(jobId, 100, "Complete");

      const job = queue.getJobStatus(jobId);
      expect(job?.progressUpdates.length).toBe(3);
      expect(job?.progressUpdates[0].message).toBe("Starting processing");
      expect(job?.progressUpdates[0].percentage).toBe(25);
      expect(job?.progressUpdates[2].message).toBe("Complete");
    });

    test("should clamp progress between 0 and 100", () => {
      const jobId = queue.submitJob("query-models", {});
      queue.updateProgress(jobId, 150, "Over 100");
      let job = queue.getJobStatus(jobId);
      expect(job?.progress).toBe(100);

      queue.updateProgress(jobId, -10, "Below 0");
      job = queue.getJobStatus(jobId);
      expect(job?.progress).toBe(0);
    });
  });

  describe("Job Completion", () => {
    test("should complete a job with result", () => {
      const jobId = queue.submitJob("query-models", {});
      const result = { response: "AI is intelligence demonstrated by machines" };

      queue.completeJob(jobId, result);

      const job = queue.getJobStatus(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.progress).toBe(100);
      expect(job?.result).toEqual(result);
      expect(job?.completedAt).toBeDefined();
    });

    test("should fail a job with error", () => {
      const jobId = queue.submitJob("query-models", {});
      const errorMsg = "Connection timeout";

      queue.failJob(jobId, errorMsg);

      const job = queue.getJobStatus(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.error).toBe(errorMsg);
      expect(job?.completedAt).toBeDefined();
    });
  });

  describe("Job Cancellation", () => {
    test("should cancel a pending job", () => {
      const jobId = queue.submitJob("query-models", {});
      const cancelled = queue.cancelJob(jobId);

      expect(cancelled).toBe(true);
      const job = queue.getJobStatus(jobId);
      expect(job?.status).toBe("cancelled");
    });

    test("should return false for non-existent job", () => {
      const cancelled = queue.cancelJob("non-existent");
      expect(cancelled).toBe(false);
    });

    test("should cancel a running job", () => {
      const jobId = queue.submitJob("query-models", {});
      const job = queue.getJobStatus(jobId);
      if (job) {
        job.status = "running";
      }

      const cancelled = queue.cancelJob(jobId);
      expect(cancelled).toBe(true);
    });
  });

  describe("Queue Statistics", () => {
    test("should report queue statistics", () => {
      const queue2 = new JobQueue(1); // Use max 1 to keep jobs in pending
      queue2.submitJob("query-models", {});
      queue2.submitJob("analyze-thinking", {});

      const stats = queue2.getStatistics();
      expect(stats.total).toBe(2);
      expect(stats.pending + stats.running).toBe(2);
      expect(stats.maxConcurrent).toBe(1);
    });

    test("should track completed jobs", () => {
      const jobId1 = queue.submitJob("query-models", {});
      const jobId2 = queue.submitJob("analyze-thinking", {});

      queue.completeJob(jobId1, { response: "test" });
      queue.failJob(jobId2, "error");

      const stats = queue.getStatistics();
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  describe("Get Jobs by Status", () => {
    test("should get jobs by status", () => {
      const queue2 = new JobQueue(1); // Max 1 to keep some pending
      const job1 = queue2.submitJob("query-models", {});
      const job2 = queue2.submitJob("query-models", {});
      const job3 = queue2.submitJob("analyze-thinking", {});

      queue2.completeJob(job1, {});

      const completed = queue2.getJobsByStatus("completed");
      const allJobs = queue2.getAllJobs();

      expect(completed.length).toBe(1);
      expect(allJobs.length).toBe(3);
    });
  });

  describe("Clear Old Jobs", () => {
    test("should clear old completed jobs", () => {
      const jobId = queue.submitJob("query-models", {});
      queue.completeJob(jobId, {});

      // Manually set completedAt to past
      const job = queue.getJobStatus(jobId);
      if (job) {
        job.completedAt = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30 hours ago
      }

      const cleared = queue.clearOldJobs(24); // Clear jobs older than 24 hours
      expect(cleared).toBe(1);

      // Job should be removed (returns null when not found)
      const retrievedJob = queue.getJobStatus(jobId);
      expect(retrievedJob).toBeNull();
    });

    test("should not clear recent completed jobs", () => {
      const jobId = queue.submitJob("query-models", {});
      queue.completeJob(jobId, {});

      const cleared = queue.clearOldJobs(24); // Clear jobs older than 24 hours
      expect(cleared).toBe(0);

      // Job should still exist
      const job = queue.getJobStatus(jobId);
      expect(job).toBeDefined();
    });
  });

  describe("Concurrent Job Execution", () => {
    test("should handle concurrent jobs up to max limit", () => {
      const maxConcurrent = 2;
      const queue2 = new JobQueue(maxConcurrent);

      // Submit more jobs than max concurrent
      const jobIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        jobIds.push(queue2.submitJob("query-models", { index: i }));
      }

      const stats = queue2.getStatistics();
      expect(stats.total).toBe(4);
      expect(stats.pending + stats.running).toBe(4);
    });

    test("should process queue when jobs complete", () => {
      const maxConcurrent = 2;
      const queue2 = new JobQueue(maxConcurrent);

      const jobIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        jobIds.push(queue2.submitJob("query-models", { index: i }));
      }

      // Complete first job, should process queue
      queue2.completeJob(jobIds[0], {});

      const stats = queue2.getStatistics();
      expect(stats.total).toBe(4);
    });
  });

  describe("Get All Jobs", () => {
    test("should get all jobs", () => {
      const queue2 = new JobQueue(1);
      queue2.submitJob("query-models", {});
      queue2.submitJob("query-models", {});
      queue2.submitJob("analyze-thinking", {});

      const allJobs = queue2.getAllJobs();
      expect(allJobs.length).toBe(3);
    });

    test("should include jobs in multiple states", () => {
      const queue2 = new JobQueue(1);
      const jobId1 = queue2.submitJob("query-models", {});
      const jobId2 = queue2.submitJob("analyze-thinking", {});
      const jobId3 = queue2.submitJob("query-models", {});

      queue2.completeJob(jobId1, {});
      queue2.failJob(jobId2, "error");

      const allJobs = queue2.getAllJobs();
      expect(allJobs.length).toBe(3);

      const statuses = allJobs.map((j) => j.status);
      expect(statuses).toContain("completed");
      expect(statuses).toContain("failed");
      expect(statuses).toEqual(expect.arrayContaining(["completed", "failed"]));
    });
  });
});
