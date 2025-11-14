import { PromptTemplate, TemplateType } from './types.js';
import { LegacyTemplate } from './LegacyTemplate.js';
import { ChatTemplate } from './ChatTemplate.js';

/**
 * Factory for creating prompt templates
 */
export class TemplateFactory {
  private static templates: Map<TemplateType, PromptTemplate> = new Map([
    ['legacy', new LegacyTemplate()],
    ['chat', new ChatTemplate()],
  ]);

  /**
   * Get a template instance by type
   */
  static getTemplate(type: TemplateType): PromptTemplate {
    const template = this.templates.get(type);
    if (!template) {
      throw new Error(`Unknown template type: ${type}`);
    }
    return template;
  }

  /**
   * Auto-detect template type based on model name
   * Patterns:
   * - command-r, cohere -> chat
   * - llama3, llama-3 -> chat (better support for Llama3 format)
   * - chatml -> chat
   * - default -> legacy
   */
  static detectTemplateType(modelName: string): TemplateType {
    const name = modelName.toLowerCase();

    // Command-R and Cohere models
    if (name.includes('command-r') || name.includes('cohere')) {
      return 'chat';
    }

    // Llama 3.x models benefit from chat format
    if (name.includes('llama3') || name.includes('llama-3')) {
      return 'chat';
    }

    // ChatML models
    if (name.includes('chatml')) {
      return 'chat';
    }

    // Mistral models
    if (name.includes('mistral')) {
      return 'chat';
    }

    // Qwen models
    if (name.includes('qwen')) {
      return 'chat';
    }

    // Default to legacy for backward compatibility
    return 'legacy';
  }
}
