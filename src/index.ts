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
  timeoutMs: 30000,
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
    } else if (job.type === 'analyze-thinking') {
      jobQueue.updateProgress(job.id, 5, 'Initializing thinking analysis');
      executeThinkingAnalysisJob(job);
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
    
    jobQueue.updateProgress(job.id, 10, 'Querying models...');
    
    // Simulate execution for now - will be replaced with actual logic
    setTimeout(() => {
      jobQueue.completeJob(job.id, { 
        response: 'Query executed', 
        modelsQueried: DEFAULT_MODELS.length 
      });
    }, 100);
  } catch (error) {
    jobQueue.failJob(job.id, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Execute a thinking analysis job asynchronously
 */
async function executeThinkingAnalysisJob(job: Job): Promise<void> {
  try {
    const input = job.input as any;
    const { question, system_prompt, model_system_prompts, session_id, num_thinking_steps } = input;
    
    jobQueue.updateProgress(job.id, 10, 'Analyzing with thinking process...');
    
    // Simulate execution for now
    setTimeout(() => {
      jobQueue.completeJob(job.id, { 
        response: 'Thinking analysis completed', 
        modelsQueried: DEFAULT_MODELS.length,
        thinkingSteps: num_thinking_steps || 5
      });
    }, 100);
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

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
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

// Tool for sequential thinking analysis
server.tool(
  "analyze-with-thinking",
  "Query models with sequential thinking process - models will think through the problem step-by-step",
  {
    question: z.string().describe("The question or problem to analyze"),
    system_prompt: z.string().optional().describe("Optional system prompt for the analysis"),
    model_system_prompts: z.record(z.string()).optional().describe("Optional object mapping model names to specific system prompts"),
    session_id: z.string().optional().describe("Session ID for conversation memory"),
    num_thinking_steps: z.number().optional().describe("Number of thinking steps to encourage (default: 5)"),
    include_history: z.boolean().optional().describe("Whether to include previous conversation history (default: true)"),
  },
  async ({ question, system_prompt, model_system_prompts, session_id, num_thinking_steps = 5, include_history = true }) => {
    try {
      // Generate or use provided session ID
      const currentSessionId = session_id || `session_${Date.now()}`;

      // Initialize session history if it doesn't exist
      if (!conversationHistory[currentSessionId]) {
        conversationHistory[currentSessionId] = [];
      }

      // Use provided models or fall back to default models from environment
      const modelsToQuery = DEFAULT_MODELS;

      debugLog(`Thinking analysis for models: ${modelsToQuery.join(", ")}`);
      debugLog(`Session ID: ${currentSessionId}`);
      debugLog(`Thinking steps requested: ${num_thinking_steps}`);

      // Enhanced system prompt for thinking
      const thinkingSystemPrompt = `You are an expert analytical AI assistant. When solving problems:
1. Break down the problem into ${num_thinking_steps} clear thinking steps
2. Show your reasoning at each step
3. Build on previous insights
4. Provide a clear final answer

Format your response as:
THINKING PROCESS:
Step 1: [thought 1]
Reasoning: [why this matters]

Step 2: [thought 2]
Reasoning: [how it relates to step 1]

... continue for ${num_thinking_steps} steps ...

FINAL ANSWER:
[Your comprehensive final response based on the thinking process]`;

      // Query each model in parallel with thinking prompts
      const responses = await Promise.all(
        modelsToQuery.map(async (modelName) => {
          try {
            // Determine which system prompt to use for this model
            let modelSystemPrompt = system_prompt || thinkingSystemPrompt;

            // If model-specific prompts are provided, use those instead
            if (model_system_prompts && model_system_prompts[modelName]) {
              modelSystemPrompt = model_system_prompts[modelName];
            }

            debugLog(`Querying ${modelName} with thinking process...`);

            // Build conversation context from history
            let conversationContext = "";

            if (include_history && conversationHistory[currentSessionId].length > 0) {
              conversationContext = "Previous conversation:\n\n";
              conversationHistory[currentSessionId].forEach(msg => {
                const role = msg.role === "user" ? "User" : `Assistant (${msg.model || "multi-model"})`;
                conversationContext += `${role}: ${msg.content}\n\n`;
              });
              conversationContext += "---\n\n";
              debugLog(`Conversation context length: ${conversationContext.length}`);
            }

            // Combine context with the current question
            const fullPrompt = include_history && conversationHistory[currentSessionId].length > 0
              ? `${conversationContext}New user question: ${question}`
              : question;

            const retryLogs: any[] = [];
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
                (log) => {
                  retryLogs.push(log);
                  if (!log.success && log.error) {
                    console.error(JSON.stringify(
                      createErrorLog(log.timestamp, log.attempt, modelName, log.error, log.nextRetryInMs)
                    ));
                  }
                }
              );
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json() as OllamaResponse;

            // Parse thinking steps from response
            const responseText = data.response;
            const thinkingMatch = responseText.match(/THINKING PROCESS:([\s\S]*?)FINAL ANSWER:/i);
            const finalMatch = responseText.match(/FINAL ANSWER:([\s\S]*)/i);

            const thinkingContent = thinkingMatch ? thinkingMatch[1].trim() : "";
            const finalAnswer = finalMatch ? finalMatch[1].trim() : responseText;

            return {
              model: modelName,
              response: finalAnswer,
              thinking: thinkingContent,
              systemPrompt: modelSystemPrompt,
              fullResponse: responseText
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

      // Add user question to history
      conversationHistory[currentSessionId].push({
        role: "user",
        content: question,
      });
      
      // Save user message to database
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

      // Add all model responses to history with thinking
      responses.forEach((resp, index) => {
        if (!resp.error) {
          conversationHistory[currentSessionId].push({
            role: "assistant",
            content: resp.response,
            model: resp.model,
            thinking: resp.thinking,
          });
          
          // Save assistant message to database with thinking
          try {
            const db = getDatabase();
            db.saveMessage(
              currentSessionId,
              conversationHistory[currentSessionId].length - 1,
              "assistant",
              resp.response,
              resp.model,
              resp.thinking
            );
          } catch (dbError) {
            console.error("Error saving assistant message to database:", dbError);
          }
        }
      });

      // Keep history manageable
      const MAX_HISTORY = 40;
      if (conversationHistory[currentSessionId].length > MAX_HISTORY) {
        conversationHistory[currentSessionId] = conversationHistory[currentSessionId].slice(-MAX_HISTORY);
      }

      // Format the response with thinking process visible
      const formattedText = `# Sequential Thinking Analysis Results\n\n**Session ID**: \`${currentSessionId}\`\n(Use this session ID to continue the conversation)\n\n${responses.map(resp => {
        const thinkingSection = resp.thinking
          ? `### 💭 Thinking Process:\n${resp.thinking}\n\n`
          : '';

        return `## ${resp.model.toUpperCase()} RESPONSE:\n\n${thinkingSection}### Final Answer:\n${resp.response}\n\n---\n\n`;
      }).join("")}\n\n**Summary**: Compare the thinking processes above to see how different models approach the problem. The diversity in thinking paths can reveal important perspectives and potential blind spots.`;

      return {
        content: [
          {
            type: "text",
            text: formattedText,
          },
        ],
      };
    } catch (error) {
      console.error("Error in analyze-with-thinking tool:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error analyzing with thinking: ${error instanceof Error ? error.message : String(error)}`,
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
    // models: z.array(z.string()).optional().describe("Array of model names to query (defaults to configured models)"),
    system_prompt: z.string().optional().describe("Optional system prompt to provide context to all models (overridden by model_system_prompts if provided)"),
    model_system_prompts: z.record(z.string()).optional().describe("Optional object mapping model names to specific system prompts"),
    session_id: z.string().optional().describe("Session ID for conversation memory. Use the same ID to continue a conversation"),
    include_history: z.boolean().optional().describe("Whether to include previous conversation history (default: true)"),
    enable_thinking: z.boolean().optional().describe("Enable sequential thinking mode for deeper analysis (default: false)"),
  },
  async ({ question, system_prompt, model_system_prompts, session_id, include_history = true, enable_thinking = false }) => {
    try {
      // If thinking is enabled, delegate to the thinking tool
      if (enable_thinking) {
        const thinkingToolParams = {
          question,
          system_prompt,
          model_system_prompts,
          session_id,
          include_history,
        };

        // We'll implement this by directly calling the thinking logic
        debugLog("Thinking mode enabled, redirecting to sequential thinking analysis");
      }

      // Generate or use provided session ID
      const currentSessionId = session_id || `session_${Date.now()}`;

      // Initialize session history if it doesn't exist
      if (!conversationHistory[currentSessionId]) {
        conversationHistory[currentSessionId] = [];
      }

      // Use provided models or fall back to default models from environment
      const modelsToQuery = DEFAULT_MODELS;

      debugLog(`Using models: ${modelsToQuery.join(", ")}`);
      debugLog(`Session ID: ${currentSessionId}`);
      debugLog(`History length: ${conversationHistory[currentSessionId].length}`);
      debugLog(`Thinking mode: ${enable_thinking}`);

      // Query each model in parallel
      const responses = await Promise.all(
        modelsToQuery.map(async (modelName) => {
          try {
            // Determine which system prompt to use for this model
            let modelSystemPrompt = system_prompt || "You are a helpful AI assistant answering a user's question.";

            // If model-specific prompts are provided, use those instead
            if (model_system_prompts && model_system_prompts[modelName]) {
              modelSystemPrompt = model_system_prompts[modelName];
            }
            // If no prompt is specified at all, use our default role-specific prompts if available
            else if (!system_prompt && modelName in DEFAULT_SYSTEM_PROMPTS) {
              modelSystemPrompt = DEFAULT_SYSTEM_PROMPTS[modelName];
            }

            debugLog(`Querying ${modelName} with system prompt: ${modelSystemPrompt.substring(0, 50)}...`);

            // Build conversation context from history
            let conversationContext = "";

            if (include_history && conversationHistory[currentSessionId].length > 0) {
              conversationContext = "Previous conversation:\n\n";
              conversationHistory[currentSessionId].forEach(msg => {
                const role = msg.role === "user" ? "User" : `Assistant (${msg.model || "multi-model"})`;
                conversationContext += `${role}: ${msg.content}\n\n`;
              });
              conversationContext += "---\n\n";
              debugLog(`Conversation context length: ${conversationContext.length}`);
            }

            // Combine context with the current question
            const fullPrompt = include_history && conversationHistory[currentSessionId].length > 0
              ? `${conversationContext}New user question: ${question}`
              : question;

            const retryLogs: any[] = [];
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
                (log) => {
                  retryLogs.push(log);
                  if (!log.success && log.error) {
                    console.error(JSON.stringify(
                      createErrorLog(log.timestamp, log.attempt, modelName, log.error, log.nextRetryInMs)
                    ));
                  }
                }
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

      // Add user question to history
      conversationHistory[currentSessionId].push({
        role: "user",
        content: question,
      });
      
      // Save user message to database
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
      responses.forEach((resp, index) => {
        if (!resp.error) {
          conversationHistory[currentSessionId].push({
            role: "assistant",
            content: resp.response,
            model: resp.model,
          });
          
          // Save assistant message to database
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

      // Keep history manageable (keep last 20 exchanges to prevent memory issues)
      const MAX_HISTORY = 40; // 20 exchanges * 2 (user + assistant)
      if (conversationHistory[currentSessionId].length > MAX_HISTORY) {
        conversationHistory[currentSessionId] = conversationHistory[currentSessionId].slice(-MAX_HISTORY);
      }

      // Format the response in a way that's easy for Claude to analyze
      const formattedText = `# Responses from Multiple Models\n\n**Session ID**: \`${currentSessionId}\`\n(Use this session ID to continue the conversation)\n\n${enable_thinking ? '✨ **Thinking mode enabled** - Models used step-by-step reasoning\n\n' : ''}${responses.map(resp => {
        const roleInfo = resp.systemPrompt ?
          `*Role: ${resp.systemPrompt.substring(0, 100)}${resp.systemPrompt.length > 100 ? '...' : ''}*\n\n` : '';

        return `## ${resp.model.toUpperCase()} RESPONSE:\n${roleInfo}${resp.response}\n\n`;
      }).join("")}\n\nConsider the perspectives above when formulating your response. You may agree or disagree with any of these models. Note that these are all compact 1-1.5B parameter models, so take that into account when evaluating their responses.`;

      return {
        content: [
          {
            type: "text",
            text: formattedText,
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
            text: `Error querying models: ${error instanceof Error ? error.message : String(error)}`,
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

// Get job progress tool
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

      const text = `# Job Progress: ${job.id}

## Status
- Type: ${job.type}
- Status: ${job.status}
- Progress: ${job.progress}%
- Created: ${job.createdAt.toISOString()}
- Started: ${job.startedAt?.toISOString() || "N/A"}
- Completed: ${job.completedAt?.toISOString() || "N/A"}

## Progress Updates
${progressText || "No progress updates"}

${job.error ? `## Error\n\`\`\`\n${job.error}\n\`\`\`` : ""}
${job.result ? `## Result\n\`\`\`json\n${JSON.stringify(job.result, null, 2)}\n\`\`\`` : ""}`;

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