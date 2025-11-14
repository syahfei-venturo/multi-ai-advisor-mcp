import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JobService } from '../../application/services/JobService.js';

/**
 * Register all job management tools
 */
export function registerJobManagementTools(server: McpServer, jobService: JobService) {
  // list-jobs tool
  server.tool(
    'list-jobs',
    'List all jobs in the queue with their status and progress',
    {
      status: z
        .enum(['pending', 'running', 'completed', 'failed', 'cancelled'])
        .optional()
        .describe('Filter jobs by status (optional)'),
    },
    async ({ status }) => {
      try {
        let jobs;
        if (status) {
          jobs = jobService.getJobsByStatus(status);
        } else {
          jobs = jobService.getAllJobs();
        }

        const stats = jobService.getStatistics();

        const formattedJobs = jobs.map((job) => ({
          id: job.id,
          type: job.type,
          status: job.status,
          progress: `${job.progress}%`,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          progressUpdates: job.progressUpdates.length,
          error: job.error,
        }));

        const text = `# Job Queue Status

## Statistics
- Total Jobs: ${stats.total}
- Pending: ${stats.pending}
- Running: ${stats.running}
- Completed: ${stats.completed}
- Failed: ${stats.failed}
- Cancelled: ${stats.cancelled}
- Max Concurrent: ${stats.maxConcurrent}

## Jobs
${formattedJobs.length === 0 ? 'No jobs found' : `\`\`\`json\n${JSON.stringify(formattedJobs, null, 2)}\n\`\`\``}`;

        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error listing jobs: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // get-job-progress tool
  server.tool(
    'get-job-progress',
    'Get detailed progress information for a specific job',
    {
      job_id: z.string().describe('The ID of the job to check'),
    },
    async ({ job_id }) => {
      try {
        const job = jobService.getJobStatus(job_id);

        if (!job) {
          return {
            content: [
              {
                type: 'text',
                text: `Job not found: ${job_id}`,
              },
            ],
          };
        }

        const progressText = job.progressUpdates
          .map(
            (update) =>
              `- [${update.percentage}%] ${update.timestamp.toISOString()}: ${update.message}`
          )
          .join('\n');

        let statusEmoji = '⏳';
        if (job.status === 'completed') statusEmoji = '✅';
        else if (job.status === 'running') statusEmoji = '🔄';
        else if (job.status === 'failed') statusEmoji = '❌';
        else if (job.status === 'cancelled') statusEmoji = '⛔';

        const text = `# ${statusEmoji} Job Progress: ${job.id}

## Status
- **Type**: ${job.type}
- **Status**: ${job.status}
- **Progress**: ${job.progress}%
- **Models**: ${job.modelCount || 'N/A'}

## Time Information
- **Created**: ${job.createdAt.toISOString()}
- **Started**: ${job.startedAt?.toISOString() || 'Not yet started'}
- **Completed**: ${job.completedAt?.toISOString() || 'In progress'}

## Progress Updates
${progressText || 'No progress updates yet'}

${job.error ? `## ❌ Error\n\`\`\`\n${job.error}\n\`\`\`` : ''}

${
  job.status === 'completed'
    ? `
## ✅ Job Completed!
Use \`get-job-result\` with job ID \`${job.id}\` to retrieve the results.
`
    : ''
}`;

        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error getting job progress: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // get-job-result tool
  server.tool(
    'get-job-result',
    'Get the result of a completed job',
    {
      job_id: z.string().describe('The ID of the completed job'),
    },
    async ({ job_id }) => {
      try {
        const job = jobService.getJobStatus(job_id);

        if (!job) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Job not found: ${job_id}`,
              },
            ],
          };
        }

        if (job.status === 'pending' || job.status === 'running') {
          return {
            content: [
              {
                type: 'text',
                text: `⏳ Job is still in progress (Status: ${job.status}, Progress: ${job.progress}%)\n\nUse \`get-job-progress\` to check the current status:\n\`\`\`\nget-job-progress(job_id="${job_id}")\n\`\`\``,
              },
            ],
          };
        }

        if (job.status === 'failed') {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `❌ Job failed with error:\n\n${job.error || 'Unknown error'}`,
              },
            ],
          };
        }

        if (job.status === 'cancelled') {
          return {
            content: [
              {
                type: 'text',
                text: `⛔ Job was cancelled`,
              },
            ],
          };
        }

        // Job is completed
        if (job.result) {
          const result = job.result as any;
          const text = result.response || JSON.stringify(result, null, 2);

          return {
            content: [
              {
                type: 'text',
                text: text,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Job ${job_id} completed but no result found`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error getting job result: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // cancel-job tool
  server.tool(
    'cancel-job',
    'Cancel a running or pending job',
    {
      job_id: z.string().describe('The ID of the job to cancel'),
    },
    async ({ job_id }) => {
      try {
        const success = jobService.cancelJob(job_id);

        if (!success) {
          return {
            content: [
              {
                type: 'text',
                text: `Could not cancel job: ${job_id} (may be already running or completed)`,
              },
            ],
          };
        }

        const job = jobService.getJobStatus(job_id);
        const text = `# Job Cancelled

Job ID: ${job_id}
Status: ${job?.status || 'unknown'}
Cancelled at: ${new Date().toISOString()}`;

        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error cancelling job: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
