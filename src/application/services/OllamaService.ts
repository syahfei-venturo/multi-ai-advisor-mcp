import { IOllamaClient } from '../../core/interfaces/IOllamaClient.js';
import { ModelResponse, ModelQueryRequest, QueryResult } from '../../core/entities/Model.js';
import { ConversationService } from './ConversationService.js';
import { TemplateFactory } from '../../core/templates/TemplateFactory.js';
import { TemplateType } from '../../core/templates/types.js';

/**
 * Service for querying Ollama models
 */
export class OllamaService {
  constructor(
    private ollamaClient: IOllamaClient,
    private conversationService: ConversationService,
    private defaultModels: string[],
    private defaultSystemPrompts: Record<string, string>,
    private templateTypes?: Record<string, TemplateType>
  ) {}

  /**
   * Query multiple models with a question and progress callback
   */
  async queryModels(
    request: ModelQueryRequest,
    onProgress?: (percentage: number, message: string) => void
  ): Promise<QueryResult> {
    const {
      question,
      systemPrompt,
      modelSystemPrompts,
      sessionId: inputSessionId,
      includeHistory = true,
    } = request;

    const sessionId = inputSessionId || `session_${Date.now()}`;

    onProgress?.(5, `Starting query for ${this.defaultModels.length} models...`);

    // Get conversation history
    const history = includeHistory
      ? this.conversationService.getHistory(sessionId)
      : [];

    // Query each model in parallel
    const responses = await Promise.all(
      this.defaultModels.map(async (modelName, index) => {
        try {
          let modelSystemPrompt =
            systemPrompt || "You are a helpful AI assistant answering a user's question.";

          if (modelSystemPrompts && modelSystemPrompts[modelName]) {
            modelSystemPrompt = modelSystemPrompts[modelName];
          } else if (!systemPrompt && modelName in this.defaultSystemPrompts) {
            modelSystemPrompt = this.defaultSystemPrompts[modelName];
          }

          onProgress?.(10 + (index * 5), `Querying ${modelName}...`);

          // Get template type for this model
          const templateType = this.templateTypes?.[modelName] ||
                              TemplateFactory.detectTemplateType(modelName);
          const template = TemplateFactory.getTemplate(templateType);

          // Format prompt using template
          const payload = template.formatPrompt(history, question, modelSystemPrompt);

          // Call appropriate API endpoint based on payload type
          const data = payload.type === 'chat'
            ? await this.ollamaClient.chat(modelName, payload.messages)
            : await this.ollamaClient.generate(modelName, payload.prompt, payload.system);

          return {
            model: modelName,
            response: data.response,
            systemPrompt: modelSystemPrompt,
          };
        } catch (modelError) {
          const errorMessage = (modelError as Error)?.message || String(modelError);
          const isCircuitBreakerOpen = errorMessage.includes('Circuit breaker is OPEN');

          console.error(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              model: modelName,
              error: errorMessage,
              severity: isCircuitBreakerOpen ? 'HIGH' : 'MEDIUM',
              is_circuit_breaker_error: isCircuitBreakerOpen,
            })
          );

          return {
            model: modelName,
            response: isCircuitBreakerOpen
              ? `⚠️ Service temporarily unavailable (circuit breaker active). ${errorMessage}`
              : `Error: Could not get response from ${modelName}. ${errorMessage}`,
            error: true,
          };
        }
      })
    );

    onProgress?.(80, 'Processing responses...');

    // Add user question to history
    this.conversationService.addUserMessage(sessionId, question);

    // Add all model responses to history
    responses.forEach((resp) => {
      if (!resp.error) {
        this.conversationService.addAssistantMessage(sessionId, resp.response, resp.model);
      }
    });

    const formattedText = this.formatResponses(sessionId, responses);

    onProgress?.(100, 'Completed');

    return {
      sessionId,
      response: formattedText,
      modelsQueried: this.defaultModels.length,
      responsesByModel: responses,
    };
  }

  /**
   * Format model responses for display
   */
  private formatResponses(sessionId: string, responses: ModelResponse[]): string {
    return `# Responses from Multiple Models

**Session ID**: \`${sessionId}\`
(Use this session ID to continue the conversation)

${responses
  .map((resp) => {
    const roleInfo = resp.systemPrompt
      ? `*Role: ${resp.systemPrompt.substring(0, 100)}${resp.systemPrompt.length > 100 ? '...' : ''}*\n\n`
      : '';

    return `## ${resp.model.toUpperCase()} RESPONSE:\n${roleInfo}${resp.response}\n\n`;
  })
  .join('')}

Consider the perspectives above when formulating your response. You may agree or disagree with any of these models. Note that these are all compact 1-1.5B parameter models, so take that into account when evaluating their responses.`;
  }
}
