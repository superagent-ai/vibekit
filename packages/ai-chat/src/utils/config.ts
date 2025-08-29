export interface ModelConfig {
  name: string;
  value: string;
  provider: 'anthropic' | 'openai' | 'gemini';
  maxTokens?: number;
}

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    name: 'Claude Sonnet 4',
    value: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    maxTokens: 4096,
  },
  {
    name: 'Claude Opus 4.1',
    value: 'claude-opus-4-1-20250805',
    provider: 'anthropic',
    maxTokens: 4096,
  },
];

export interface ChatConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  showMCPTools?: boolean;
  webSearch?: boolean;
}

/**
 * Get configuration from environment with fallbacks
 */
function getEnvConfig() {
  const parseTemperature = (value: string): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0.7 : parsed;
  };
  
  const parseMaxTokens = (value: string): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 4096 : parsed;
  };
  
  return {
    temperature: process.env.CHAT_TEMPERATURE 
      ? parseTemperature(process.env.CHAT_TEMPERATURE) 
      : 0.7,
    maxTokens: process.env.CHAT_MAX_TOKENS 
      ? parseMaxTokens(process.env.CHAT_MAX_TOKENS) 
      : 4096,
    defaultModel: process.env.CHAT_DEFAULT_MODEL || DEFAULT_MODELS[0].value,
  };
}

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  model: getEnvConfig().defaultModel,
  temperature: getEnvConfig().temperature,
  maxTokens: getEnvConfig().maxTokens,
  showMCPTools: false,
  webSearch: false,
};