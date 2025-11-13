import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { getConfig, printConfigInfo } from "./config.js";
import { initializeDatabase, getDatabase, closeDatabase } from "./database.js";

// Load configuration from environment and CLI arguments
const config = getConfig();

// Ollama API URL and models from config
const OLLAMA_API_URL = config.ollama.apiUrl;
const DEFAULT_MODELS = config.ollama.models;

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

            const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
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
            console.error(`Error querying model ${modelName}:`, modelError);
            return {
              model: modelName,
              response: `Error: Could not get response from ${modelName}. Make sure this model is available in Ollama.`,
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

            const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
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
            console.error(`Error querying model ${modelName}:`, modelError);
            return {
              model: modelName,
              response: `Error: Could not get response from ${modelName}. Make sure this model is available in Ollama.`,
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

async function main() {
  try {
    // Initialize database
    initializeDatabase();
    const db = getDatabase();
    debugLog(`Database initialized at: ${db.getDatabasePath()}`);
    
    // Load existing sessions from database
    await loadExistingSessions();
    
    // Print configuration info on startup
    printConfigInfo(config);
    
    // Print database statistics
    const stats = db.getStatistics();
    console.error(`📊 Database Statistics: ${stats.totalSessions} sessions, ${stats.totalMessages} messages, ${(stats.databaseSize / 1024).toFixed(2)} KB`);

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