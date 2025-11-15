import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConversationService } from '../../application/services/ConversationService.js';

/**
 * Register the manage-conversation tool
 */
export function registerManageConversationTool(
  server: McpServer,
  conversationService: ConversationService,
  notifyConversationUpdate?: (sessionId: string) => void
) {
  server.tool(
    'manage-conversation',
    'Manage conversation history - view, clear, or get session information',
    {
      session_id: z.string().describe('The session ID to manage'),
      action: z
        .enum(['view', 'clear', 'list'])
        .describe(
          "Action to perform: 'view' to see history, 'clear' to reset, 'list' to see all sessions"
        ),
    },
    async ({ session_id, action }) => {
      try {
        if (action === 'list') {
          const sessions = conversationService.getAllSessions();
          const sessionList = sessions
            .map((id) => {
              const messages = conversationService.getHistory(id);
              return `- **${id}**: ${messages.length} messages`;
            })
            .join('\n');

          return {
            content: [
              {
                type: 'text',
                text:
                  sessionList.length > 0
                    ? `# Active Conversation Sessions\n\n${sessionList}`
                    : 'No active conversation sessions found.',
              },
            ],
          };
        }

        if (action === 'view') {
          const history = conversationService.getHistory(session_id);
          if (history.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No conversation history found for session ID: ${session_id}`,
                },
              ],
            };
          }

          const historyText = history
            .map((msg, idx) => {
              const role =
                msg.role === 'user'
                  ? '👤 User'
                  : `🤖 Assistant (${msg.model || 'multi-model'})`;
              const thinkingSection = msg.thinking
                ? `\n\n**💭 Internal Thinking:**\n${msg.thinking}`
                : '';
              return `${idx + 1}. **${role}**\n${msg.content}${thinkingSection}\n`;
            })
            .join('\n---\n\n');

          return {
            content: [
              {
                type: 'text',
                text: `# Conversation History for ${session_id}\n\n${historyText}`,
              },
            ],
          };
        }

        if (action === 'clear') {
          conversationService.clearHistory(session_id);

          // Notify WebUI about conversation update
          if (notifyConversationUpdate) {
            notifyConversationUpdate(session_id);
          }

          return {
            content: [
              {
                type: 'text',
                text: `✓ Conversation history cleared for session ID: ${session_id}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: 'Unknown action',
            },
          ],
        };
      } catch (error) {
        console.error('Error managing conversation:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error managing conversation: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
