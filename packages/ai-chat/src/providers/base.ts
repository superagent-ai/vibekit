import type { LanguageModel } from 'ai';

export interface AIProvider {
  name: string;
  createModel(modelId: string): LanguageModel;
  isAvailable(): boolean;
  getAvailableModels(): { name: string; value: string }[];
}