import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { AIProvider } from './base';
import { AuthManager } from '../utils/auth';

export class AnthropicProvider implements AIProvider {
  name = 'Anthropic';
  private apiKey?: string;

  constructor() {
    const authManager = AuthManager.getInstance();
    this.apiKey = authManager.getApiKey();
  }

  createModel(modelId: string): LanguageModel {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }
    const anthropic = createAnthropic({ apiKey: this.apiKey });
    return anthropic(modelId);
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getAvailableModels() {
    return [
      {
        name: 'Claude Sonnet 4',
        value: 'claude-sonnet-4-20250514',
      },
      {
        name: 'Claude Opus 4.1',
        value: 'claude-opus-4-1-20250805',
      },
    ];
  }
}

// Factory functions for backward compatibility and testing
export function createAnthropicProviderWithModel(modelId: string = 'claude-sonnet-4-20250514'): { provider: AnthropicProvider, model: LanguageModel } {
  const provider = new AnthropicProvider();
  const model = provider.createModel(modelId);
  return { provider, model };
}

export function createClaudeCodeProvider(modelId: string = 'claude-sonnet-4-20250514'): AnthropicProvider {
  return new AnthropicProvider();
}