import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JobService } from '../../application/services/JobService.js';
import { OllamaService } from '../../application/services/OllamaService.js';

/**
 * Register the query-models tool
 */
export function registerQueryModelsTool(
  server: McpServer,
  jobService: JobService,
  ollamaService: OllamaService,
  defaultModels: string[],
  debugLog: (message: string) => void
) {
  // Setup job execution handler
  jobService.onJobStarted(async (job) => {
    if (job.type === 'query-models') {
      try {
        const input = job.input as any;
        const { question, system_prompt, model_system_prompts, session_id, include_history } =
          input;

        const result = await ollamaService.queryModels(
          {
            question,
            systemPrompt: system_prompt,
            modelSystemPrompts: model_system_prompts,
            sessionId: session_id,
            includeHistory: include_history,
          },
          (percentage, message) => {
            jobService.updateProgress(job.id, percentage, message);
          }
        );

        jobService.completeJob(job.id, result);
      } catch (error) {
        jobService.failJob(job.id, error instanceof Error ? error.message : String(error));
      }
    }
  });

  server.tool(
    'query-models',
    'Query multiple AI models via Ollama and get their responses to compare perspectives',
    {
      question: z.string().describe('The question to ask all models'),
      system_prompt: z
        .string()
        .optional()
        .describe(
          'Optional system prompt to provide context to all models (overridden by model_system_prompts if provided)'
        ),
      model_system_prompts: z
        .record(z.string())
        .optional()
        .describe('Optional object mapping model names to specific system prompts'),
      session_id: z
        .string()
        .optional()
        .describe('Session ID for conversation memory. Use the same ID to continue a conversation'),
      include_history: z
        .boolean()
        .optional()
        .describe('Whether to include previous conversation history (default: true)'),
      wait_for_completion: z
        .boolean()
        .optional()
        .describe(
          'If true (default), wait for the job to complete and return results immediately. If false, return job ID for async polling'
        ),
    },
    async ({
      question,
      system_prompt,
      model_system_prompts,
      session_id,
      include_history = true,
      wait_for_completion = true,
    }) => {
      try {
        const modelsCount = defaultModels.length;

        // Submit job to queue (non-blocking)
        const jobId = jobService.submitJob(
          'query-models',
          {
            question,
            system_prompt,
            model_system_prompts,
            session_id: session_id || `session_${Date.now()}`,
            include_history,
          },
          modelsCount
        );

        debugLog(`Query job submitted: ${jobId}`);

        // If wait_for_completion is true, poll until job is done
        if (wait_for_completion) {
          const maxWaitTime = 600000; // 10 minutes max
          const pollInterval = 1000; // Check every 1 second
          const startTime = Date.now();

          while (Date.now() - startTime < maxWaitTime) {
            const job = jobService.getJobStatus(jobId);

            if (!job) {
              return {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: `Job ${jobId} not found`,
                  },
                ],
              };
            }

            if (job.status === 'completed') {
              const result = jobService.getJobResult(jobId);
              if (!result) {
                return {
                  isError: true,
                  content: [
                    {
                      type: 'text',
                      text: `Job completed but no result found for job ID: ${jobId}`,
                    },
                  ],
                };
              }

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                  },
                ],
              };
            } else if (job.status === 'failed') {
              return {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: `Job failed: ${job.error || 'Unknown error'}`,
                  },
                ],
              };
            } else if (job.status === 'cancelled') {
              return {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: `Job was cancelled`,
                  },
                ],
              };
            }

            // Wait before next poll
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          }

          // Timeout reached
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Job timeout: Maximum wait time of ${maxWaitTime / 1000} seconds reached. Job ID: ${jobId}\n\nYou can still check the job status using get-job-progress and retrieve results with get-job-result.`,
              },
            ],
          };
        }

        // Default behavior: return job ID for async polling
        const responseText = `# ⏳ Query Submitted (Job ID: \`${jobId}\`)

## Progress Information
- **Status**: Pending
- **Models to Query**: ${modelsCount}
- **Job ID**: \`${jobId}\`

## Next Steps
1. Use **get-job-progress** with job ID \`${jobId}\` to check status
2. Wait for status to show "completed"
3. Then use **get-job-result** with job ID \`${jobId}\` to retrieve the full results

## Example Usage
\`\`\`
get-job-progress(job_id="${jobId}")
\`\`\`

Once the job is completed, you can fetch results with:
\`\`\`
get-job-result(job_id="${jobId}")
\`\`\`

**Note**: By default, queries wait for completion automatically. Set \`wait_for_completion: false\` if you prefer async polling.`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      } catch (error) {
        console.error('Error in query-models tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error submitting query job: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
