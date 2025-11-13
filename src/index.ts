import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { getConfig, printConfigInfo } from "./config.js";
import { initializeDatabase, getDatabase, closeDatabase } from "./database.js";
import { withRetry, CircuitBreaker, DEFAULT_RETRY_CONFIG, isRetryableError, createErrorLog } from "./retry.js";
import { jobQueue, Job } from "./jobqueue.js";

// Load configuration from environment and CLI arguments
const config = getConfig();

// Ollama API URL and models from config
const OLLAMA_API_URL = config.ollama.apiUrl;
const DEFAULT_MODELS = config.ollama.models;

// Job queue configuration (with defaults from config)
const RETRY_CONFIG = config.jobQueue ? {
  maxAttempts: config.jobQueue.defaultRetryAttempts,
  initialDelayMs: config.jobQueue.defaultInitialDelayMs,
  maxDelayMs: config.jobQueue.defaultMaxDelayMs,
  multiplier: 2,
  timeoutMs: 500000,
} : DEFAULT_RETRY_CONFIG;

// Store conversation history per session
interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  model?: string;
  thinking?: string;
}

interface ConversationSession {
  [sessionId: string]: ConversationMessage[];
}

const conversationHistory: ConversationSession = {};

// Interface for sequential thinking thoughts
interface ThinkingStep {
  thoughtNumber: number;
  thought: string;
  reasoning: string;
}

interface ModelThinkingProcess {
  modelName: string;
  steps: ThinkingStep[];
  finalResponse: string;
}

// Create server instance
const server = new McpServer({
  name: config.server.name,
  version: config.server.version,
});

// Circuit breaker for Ollama API calls
const ollamaCircuitBreaker = new CircuitBreaker(
  5, // Failure threshold
  60000 // Reset timeout (1 minute)
);

// Setup job queue handler for executing jobs
jobQueue.onJobStarted_attach(async (job: Job) => {
  // This handler executes jobs in the background
  try {
    if (job.type === 'query-models') {
      // Execute query-models job
      jobQueue.updateProgress(job.id, 5, 'Preparing query execution');
      executeQueryModelJob(job);
    }
    
  } catch (error) {
    jobQueue.failJob(job.id, error instanceof Error ? error.message : String(error));
  }
});

/**
 * Execute a query-models job asynchronously
 */
async function executeQueryModelJob(job: Job): Promise<void> {
  try {
    const input = job.input as any;
    const { question, system_prompt, model_system_prompts, session_id, include_history } = input;
    
    const modelsToQuery = DEFAULT_MODELS;
    const currentSessionId = session_id || `session_${Date.now()}`;

    if (!conversationHistory[currentSessionId]) {
      conversationHistory[currentSessionId] = [];
    }

    jobQueue.updateProgress(job.id, 5, `Starting query for ${modelsToQuery.length} models...`);

    // Query each model in parallel
    const responses = await Promise.all(
      modelsToQuery.map(async (modelName) => {
        try {
          let modelSystemPrompt = system_prompt || "You are a helpful AI assistant answering a user's question.";

          if (model_system_prompts && model_system_prompts[modelName]) {
            modelSystemPrompt = model_system_prompts[modelName];
          } else if (!system_prompt && modelName in DEFAULT_SYSTEM_PROMPTS) {
            modelSystemPrompt = DEFAULT_SYSTEM_PROMPTS[modelName];
          }

          jobQueue.updateProgress(job.id, 10 + (modelsToQuery.indexOf(modelName) * 5), `Querying ${modelName}...`);

          let conversationContext = "";
          if (include_history && conversationHistory[currentSessionId].length > 0) {
            conversationContext = "Previous conversation:\n\n";
            conversationHistory[currentSessionId].forEach(msg => {
              const role = msg.role === "user" ? "User" : `Assistant (${msg.model || "multi-model"})`;
              conversationContext += `${role}: ${msg.content}\n\n`;
            });
            conversationContext += "---\n\n";
          }

          const fullPrompt = include_history && conversationHistory[currentSessionId].length > 0
            ? `${conversationContext}New user question: ${question}`
            : question;

          const response = await ollamaCircuitBreaker.execute(async () => {
            return withRetry(
              async () => {
                const res = await fetch(`${OLLAMA_API_URL}/api/generate`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: modelName,
                    prompt: fullPrompt,
                    system: modelSystemPrompt,
                    stream: false,
                  }),
                });

                if (!res.ok) {
                  throw new Error(`HTTP error! status: ${res.status}`);
                }

                return res;
              },
              RETRY_CONFIG,
              undefined
            );
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json() as OllamaResponse;
          return {
            model: modelName,
            response: data.response,
            systemPrompt: modelSystemPrompt
          };
        } catch (modelError) {
          const errorMessage = (modelError as Error)?.message || String(modelError);
          const isCircuitBreakerOpen = errorMessage.includes("Circuit breaker is OPEN");
          
          console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            model: modelName,
            error: errorMessage,
            severity: isCircuitBreakerOpen ? "HIGH" : "MEDIUM",
            is_circuit_breaker_error: isCircuitBreakerOpen,
          }));
          
          return {
            model: modelName,
            response: isCircuitBreakerOpen
              ? `⚠️ Service temporarily unavailable (circuit breaker active). ${errorMessage}`
              : `Error: Could not get response from ${modelName}. ${errorMessage}`,
            error: true
          };
        }
      })
    );

    jobQueue.updateProgress(job.id, 80, 'Processing responses...');

    // Add user question to history
    conversationHistory[currentSessionId].push({
      role: "user",
      content: question,
    });
    
    try {
      const db = getDatabase();
      db.saveMessage(
        currentSessionId,
        conversationHistory[currentSessionId].length - 1,
        "user",
        question
      );
    } catch (dbError) {
      console.error("Error saving user message to database:", dbError);
    }

    // Add all model responses to history
    responses.forEach((resp) => {
      if (!resp.error) {
        conversationHistory[currentSessionId].push({
          role: "assistant",
          content: resp.response,
          model: resp.model,
        });
        
        try {
          const db = getDatabase();
          db.saveMessage(
            currentSessionId,
            conversationHistory[currentSessionId].length - 1,
            "assistant",
            resp.response,
            resp.model
          );
        } catch (dbError) {
          console.error("Error saving assistant message to database:", dbError);
        }
      }
    });

    const MAX_HISTORY = 40;
    if (conversationHistory[currentSessionId].length > MAX_HISTORY) {
      conversationHistory[currentSessionId] = conversationHistory[currentSessionId].slice(-MAX_HISTORY);
    }

    const formattedText = `# Responses from Multiple Models\n\n**Session ID**: \`${currentSessionId}\`\n(Use this session ID to continue the conversation)\n\n${responses.map(resp => {
      const roleInfo = resp.systemPrompt ?
        `*Role: ${resp.systemPrompt.substring(0, 100)}${resp.systemPrompt.length > 100 ? '...' : ''}*\n\n` : '';

      return `## ${resp.model.toUpperCase()} RESPONSE:\n${roleInfo}${resp.response}\n\n`;
    }).join("")}\n\nConsider the perspectives above when formulating your response. You may agree or disagree with any of these models. Note that these are all compact 1-1.5B parameter models, so take that into account when evaluating their responses.`;

    jobQueue.completeJob(job.id, {
      sessionId: currentSessionId,
      response: formattedText,
      modelsQueried: modelsToQuery.length,
      responsesByModel: responses
    });

    jobQueue.updateProgress(job.id, 100, 'Completed');
  } catch (error) {
    jobQueue.failJob(job.id, error instanceof Error ? error.message : String(error));
  }
}


// Define Ollama response types
interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

// Fix the type for system prompts with index signature
interface SystemPrompts {
  [key: string]: string;
}

// Default system prompts for each model
const DEFAULT_SYSTEM_PROMPTS: SystemPrompts = config.prompts;

// Debug log if enabled
const debugLog = (message: string) => {
  if (config.server.debug) {
    console.error(`[DEBUG] ${message}`);
  }
};

// Tool to manage conversation history
server.tool(
  "manage-conversation",
  "Manage conversation history - view, clear, or get session information",
  {
    session_id: z.string().describe("The session ID to manage"),
    action: z.enum(["view", "clear", "list"]).describe("Action to perform: 'view' to see history, 'clear' to reset, 'list' to see all sessions"),
  },
  async ({ session_id, action }) => {
    try {
      if (action === "list") {
        const sessionList = Object.entries(conversationHistory)
          .map(([id, messages]) => `- **${id}**: ${messages.length} messages`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: sessionList.length > 0
                ? `# Active Conversation Sessions\n\n${sessionList}`
                : "No active conversation sessions found."
            }
          ]
        };
      }

      if (action === "view") {
        if (!conversationHistory[session_id]) {
          return {
            content: [
              {
                type: "text",
                text: `No conversation history found for session ID: ${session_id}`
              }
            ]
          };
        }

        const historyText = conversationHistory[session_id]
          .map((msg, idx) => {
            const role = msg.role === "user" ? "👤 User" : `🤖 Assistant (${msg.model || "multi-model"})`;
            const thinkingSection = msg.thinking ? `\n\n**💭 Internal Thinking:**\n${msg.thinking}` : '';
            return `${idx + 1}. **${role}**\n${msg.content}${thinkingSection}\n`;
          })
          .join("\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text: `# Conversation History for ${session_id}\n\n${historyText}`
            }
          ]
        };
      }

      if (action === "clear") {
        delete conversationHistory[session_id];
        return {
          content: [
            {
              type: "text",
              text: `✓ Conversation history cleared for session ID: ${session_id}`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: "Unknown action"
          }
        ]
      };
    } catch (error) {
      console.error("Error managing conversation:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error managing conversation: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Register the tool for querying multiple models
server.tool(
  "query-models",
  "Query multiple AI models via Ollama and get their responses to compare perspectives",
  {
    question: z.string().describe("The question to ask all models"),
    system_prompt: z.string().optional().describe("Optional system prompt to provide context to all models (overridden by model_system_prompts if provided)"),
    model_system_prompts: z.record(z.string()).optional().describe("Optional object mapping model names to specific system prompts"),
    session_id: z.string().optional().describe("Session ID for conversation memory. Use the same ID to continue a conversation"),
    include_history: z.boolean().optional().describe("Whether to include previous conversation history (default: true)"),
  },
  async ({ question, system_prompt, model_system_prompts, session_id, include_history = true }) => {
    try {
      // Estimate time based on models count and thinking mode
      const modelsCount = DEFAULT_MODELS.length;

      // Submit job to queue (non-blocking)
      const jobId = jobQueue.submitJob(
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
\`\`\``;

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      console.error("Error in query-models tool:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error submitting query job: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Health check tool for monitoring system status
server.tool(
  "health-check",
  "Check the health of the MCP server and its components (Ollama connectivity, database status, circuit breaker state)",
  {},
  async () => {
    try {
      const health: any = {
        timestamp: new Date().toISOString(),
        status: "healthy",
        components: {
          database: {
            status: "unknown",
            message: "",
          },
          ollama: {
            status: "unknown",
            message: "",
            url: OLLAMA_API_URL,
          },
          circuitBreaker: {
            state: ollamaCircuitBreaker.getState(),
            stats: ollamaCircuitBreaker.getStats(),
          },
          conversation: {
            sessions: Object.keys(conversationHistory).length,
            totalMessages: Object.values(conversationHistory).reduce((sum, msgs) => sum + msgs.length, 0),
          },
          jobQueue: {
            statistics: jobQueue.getStatistics(),
          },
        },
      };

      // Check database
      try {
        const db = getDatabase();
        const stats = db.getStatistics();
        health.components.database = {
          status: "healthy",
          message: `Database connected - ${stats.totalMessages} messages in ${stats.totalSessions} sessions`,
          statistics: stats,
        };
      } catch (error) {
        health.components.database = {
          status: "error",
          message: (error as Error).message,
        };
        health.status = "degraded";
      }

      // Check Ollama connectivity
      try {
        const response = await withRetry(
          async () => {
            const res = await fetch(`${OLLAMA_API_URL}/api/tags`, {
              method: "GET",
              headers: { "Content-Type": "application/json" },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
          },
          { ...RETRY_CONFIG, maxAttempts: 2 },
          undefined
        );

        const data = await response.json() as { models?: any[] };
        health.components.ollama = {
          status: "healthy",
          message: `Ollama is running with ${(data.models || []).length} models available`,
          models_count: (data.models || []).length,
        };
      } catch (error) {
        health.components.ollama = {
          status: "error",
          message: (error as Error).message,
          url: OLLAMA_API_URL,
        };
        health.status = "degraded";
      }

      return {
        content: [
          {
            type: "text",
            text: `# System Health Check\n\n\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\``,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Health check error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Job queue management tools
server.tool(
  "list-jobs",
  "List all jobs in the queue with their status and progress",
  {
    status: z.enum(["pending", "running", "completed", "failed", "cancelled"]).optional().describe("Filter jobs by status (optional)"),
  },
  async ({ status }) => {
    try {
      let jobs;
      if (status) {
        jobs = jobQueue.getJobsByStatus(status);
      } else {
        jobs = jobQueue.getAllJobs();
      }

      const stats = jobQueue.getStatistics();

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
${formattedJobs.length === 0 ? "No jobs found" : `\`\`\`json\n${JSON.stringify(formattedJobs, null, 2)}\n\`\`\``}`;

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error listing jobs: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Get job progress tool with detailed info
server.tool(
  "get-job-progress",
  "Get detailed progress information for a specific job",
  {
    job_id: z.string().describe("The ID of the job to check"),
  },
  async ({ job_id }) => {
    try {
      const job = jobQueue.getJobStatus(job_id);

      if (!job) {
        return {
          content: [
            {
              type: "text",
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
        .join("\n");

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
- **Started**: ${job.startedAt?.toISOString() || "Not yet started"}
- **Completed**: ${job.completedAt?.toISOString() || "In progress"}

## Progress Updates
${progressText || "No progress updates yet"}

${job.error ? `## ❌ Error\n\`\`\`\n${job.error}\n\`\`\`` : ''}

${job.status === 'completed' ? `
## ✅ Job Completed!
Use \`get-job-result\` with job ID \`${job.id}\` to retrieve the results.
` : ''}`;

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error getting job progress: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Get job result tool (new tool for retrieving completed job results)
server.tool(
  "get-job-result",
  "Get the result of a completed job",
  {
    job_id: z.string().describe("The ID of the completed job"),
  },
  async ({ job_id }) => {
    try {
      const job = jobQueue.getJobStatus(job_id);

      if (!job) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Job not found: ${job_id}`,
            },
          ],
        };
      }

      if (job.status === 'pending' || job.status === 'running') {
        return {
          content: [
            {
              type: "text",
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
              type: "text",
              text: `❌ Job failed with error:\n\n${job.error || 'Unknown error'}`,
            },
          ],
        };
      }

      if (job.status === 'cancelled') {
        return {
          content: [
            {
              type: "text",
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
              type: "text",
              text: text,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Job ${job_id} completed but no result found`,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error getting job result: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Cancel job tool
server.tool(
  "cancel-job",
  "Cancel a running or pending job",
  {
    job_id: z.string().describe("The ID of the job to cancel"),
  },
  async ({ job_id }) => {
    try {
      const success = jobQueue.cancelJob(job_id);

      if (!success) {
        return {
          content: [
            {
              type: "text",
              text: `Could not cancel job: ${job_id} (may be already running or completed)`,
            },
          ],
        };
      }

      const job = jobQueue.getJobStatus(job_id);
      const text = `# Job Cancelled

Job ID: ${job_id}
Status: ${job?.status || "unknown"}
Cancelled at: ${new Date().toISOString()}`;

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error cancelling job: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

// Start the server
async function loadExistingSessions() {
  try {
    const db = getDatabase();
    const sessions = db.getAllSessions();
    
    for (const sessionId of sessions) {
      const messages = db.loadSessionHistory(sessionId);
      conversationHistory[sessionId] = messages.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
        model: msg.model_name,
        thinking: msg.thinking_text,
      }));
      debugLog(`Loaded ${messages.length} messages for session: ${sessionId}`);
    }
    
    if (sessions.length > 0) {
      console.error(`✅ Database: Loaded ${sessions.length} existing sessions with conversation history`);
    }
  } catch (error) {
    console.error(`⚠️ Database: Error loading existing sessions:`, error);
  }
}

/**
 * Restore incomplete jobs from database for recovery on restart
 */
async function restoreIncompleteJobs() {
  try {
    const db = getDatabase();
    const jobs = db.getAllJobs();
    
    const incompleteJobs = jobs.filter(job => 
      job.status === 'pending' || job.status === 'running'
    );

    if (incompleteJobs.length > 0) {
      console.error(`⚠️ Restoring ${incompleteJobs.length} incomplete jobs from database...`);
      
      for (const job of incompleteJobs) {
        // Re-submit jobs that were pending or running
        if (job.status === 'pending' || job.status === 'running') {
          const newJobId = jobQueue.submitJob(job.type as any, job.input);
          debugLog(`Restored job ${job.id} → new ID: ${newJobId}`);
        }
      }
    }
  } catch (error) {
    console.error(`⚠️ Database: Error restoring jobs:`, error);
  }
}

async function main() {
  try {
    // Initialize database
    initializeDatabase();
    const db = getDatabase();
    debugLog(`Database initialized at: ${db.getDatabasePath()}`);
    
    // Load existing sessions from database
    await loadExistingSessions();
    
    // Restore incomplete jobs from database
    await restoreIncompleteJobs();
    
    // Print configuration info on startup
    printConfigInfo(config);
    
    // Print database statistics
    const stats = db.getStatistics();
    console.error(`📊 Database Statistics: ${stats.totalSessions} sessions, ${stats.totalMessages} messages, ${(stats.databaseSize / 1024).toFixed(2)} KB`);
    if (stats.jobStats) {
      console.error(`📋 Job Statistics: ${stats.totalJobs} total, ${stats.jobStats.pending} pending, ${stats.jobStats.running} running, ${stats.jobStats.completed} completed, ${stats.jobStats.failed} failed`);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`\n✅ Multi-Model Advisor MCP Server running on stdio`);
    
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.error('\n👋 Shutting down gracefully...');
      closeDatabase();
      process.exit(0);
    });
  } catch (error) {
    console.error("Fatal error in main():", error);
    closeDatabase();
    process.exit(1);
  }
}

// Call main function to start the server
main();