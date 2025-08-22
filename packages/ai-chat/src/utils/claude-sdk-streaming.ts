import { AuthManager } from './auth';
import { createLogger } from '@vibe-kit/logging';

// Create logger for this module
const log = createLogger('claude-sdk');

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Creates a custom Anthropic provider that uses Claude Code SDK under the hood
 * This allows us to use AI SDK's streamText while getting OAuth functionality
 */
export function createClaudeCodeProvider(authManager?: AuthManager) {
  const auth = authManager || AuthManager.getInstance();
  const oauthToken = auth.getOAuthToken();
  
  if (!oauthToken) {
    throw new Error('No OAuth token available for Claude Code SDK');
  }

  log.debug('Creating Claude Code provider', { tokenPrefix: oauthToken.substring(0, 10) });

  // Create a provider that mimics Anthropic's interface but uses Claude Code SDK
  return {
    createLanguageModel: (modelId: string) => ({
      modelId,
      provider: 'anthropic-claude-code',
      specificationVersion: 'v2' as const,
      supportedUrls: {},
      supportsStreaming: true,
      
      async doGenerate(options: any) {
        try {
          log.debug('doGenerate called', { messageCount: options.messages?.length, hasModel: !!options.model });
          return await generateWithClaudeCodeSDK(options, oauthToken);
        } catch (error) {
          log.error('doGenerate error', error);
          throw error;
        }
      },
      
      async doStream(options: any) {
        try {
          log.debug('doStream called', { messageCount: options.messages?.length, hasModel: !!options.model });
          return await streamWithClaudeCodeSDK(options, oauthToken);
        } catch (error) {
          log.error('doStream error', error);
          throw error;
        }
      }
    })
  };
}

/**
 * Generate response using Claude Code SDK (non-streaming)
 */
async function generateWithClaudeCodeSDK(options: any, oauthToken: string) {
  // Implementation for non-streaming
  const response = await queryClaudeCodeSDK(options, oauthToken);
  
  return {
    content: [
      {
        type: 'text' as const,
        text: response
      }
    ],
    finishReason: 'stop' as const,
    usage: {
      promptTokens: 0,
      completionTokens: response.split(' ').length,
      inputTokens: 0,
      outputTokens: response.split(' ').length,
      totalTokens: response.split(' ').length
    },
    warnings: []
  };
}

/**
 * Stream response using Claude Code SDK
 */
async function streamWithClaudeCodeSDK(options: any, oauthToken: string) {
  log.debug('Starting streaming', { messageCount: options.messages?.length });
  
  // Get the full response first
  const fullResponse = await queryClaudeCodeSDK(options, oauthToken);
  
  // Create a proper ReadableStream that matches AI SDK expectations
  const textId = Math.random().toString(36).substring(2, 15);
  
  const stream = new ReadableStream({
    start(controller) {
      // Send text-start event
      controller.enqueue({
        type: 'text-start' as const,
        id: textId
      });
      
      // Split response into chunks and send as deltas
      const words = fullResponse.split(' ');
      let currentIndex = 0;
      
      const sendNextChunk = () => {
        if (currentIndex < words.length) {
          const delta = (currentIndex > 0 ? ' ' : '') + words[currentIndex];
          
          controller.enqueue({
            type: 'text-delta' as const,
            id: textId,
            delta: delta
          });
          
          currentIndex++;
          setTimeout(sendNextChunk, 50);
        } else {
          // Send text-end event
          controller.enqueue({
            type: 'text-end' as const,
            id: textId
          });
          
          // Send finish event
          controller.enqueue({
            type: 'finish' as const,
            finishReason: 'stop' as const,
            usage: {
              promptTokens: 0,
              completionTokens: words.length,
              inputTokens: 0,
              outputTokens: words.length,
              totalTokens: words.length
            }
          });
          
          controller.close();
        }
      };
      
      // Start streaming
      sendNextChunk();
    }
  });
  
  return {
    stream,
    rawCall: { rawPrompt: null, rawSettings: {} }
  };
}

/**
 * Query Claude Code SDK and get the response
 */
async function queryClaudeCodeSDK(options: any, oauthToken: string): Promise<string> {
  const { query } = await import('@anthropic-ai/claude-code');
  
  // Convert AI SDK messages to prompt format - use simple format for chat
  const messages = options.messages || [];
  let prompt = '';
  
  // Get the last user message as the main prompt
  const userMessages = messages.filter((msg: any) => msg.role === 'user');
  if (userMessages.length > 0) {
    prompt = userMessages[userMessages.length - 1].content;
  } else {
    prompt = 'Hello';
  }
  
  const queryOptions: any = {
    authToken: oauthToken,
    model: options.model || 'claude-sonnet-4-20250514',
    maxTurns: 1
  };
  
  log.debug('Query options configured', { model: queryOptions.model, maxTurns: queryOptions.maxTurns });
  log.debug('Prompt prepared', { prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '') });
  
  // Collect full response using the same pattern as generatePRMetadata
  let fullResponse = '';
  
  try {
  
    for await (const message of query({
      prompt,
      ...queryOptions
    })) {
      log.debug('Received message', { type: typeof message, contentLength: typeof message === 'string' ? message.length : 'N/A' });
      
      // Handle messages exactly like generatePRMetadata does
      if (typeof message === 'string') {
        fullResponse += message;
      } else if (typeof message === 'object' && message !== null) {
        // Extract text content from different message types
        const msgStr = JSON.stringify(message);
        // Look for any meaningful content in the message
        if (msgStr.includes('content') || msgStr.includes('text') || msgStr.includes('result')) {
          log.debug('Processing message object', { hasContent: 'content' in message, hasText: 'text' in message, hasResult: 'result' in message });
          
          // Try to extract text content directly (with proper type handling)
          const msg = message as any; // Type assertion for Claude Code SDK message format
          if (msg.content && typeof msg.content === 'string') {
            fullResponse += msg.content;
          } else if (msg.text && typeof msg.text === 'string') {
            fullResponse += msg.text;
          } else if (msg.result && typeof msg.result === 'string') {
            fullResponse += msg.result;
          } else {
            // As fallback, add the full message string if it contains text
            fullResponse += msgStr;
          }
        }
      }
    }
  } catch (error) {
    log.error('Error during query', error);
    throw error;
  }

  log.debug('Raw response received', { length: fullResponse.length, preview: fullResponse.substring(0, 100) + (fullResponse.length > 100 ? '...' : '') });
  
  // Parse the response using strategies similar to generatePRMetadata
  let cleanResponse = fullResponse;
  
  // Try to extract clean text content from various possible response formats
  const extractStrategies = [
    // Strategy 1: Use response as-is if it's already clean text
    () => {
      if (fullResponse && !fullResponse.startsWith('{') && !fullResponse.includes('"type"')) {
        return fullResponse.trim();
      }
      return null;
    },
    
    // Strategy 2: Parse as JSON and extract text field
    () => {
      try {
        const parsed = JSON.parse(fullResponse);
        if (parsed.text) return parsed.text;
        if (parsed.content) return parsed.content;
        if (parsed.result) return parsed.result;
      } catch (e) {
        // Not valid JSON, continue
      }
      return null;
    },
    
    // Strategy 3: Extract text from quoted content field
    () => {
      const contentMatch = fullResponse.match(/"content":\s*"([^"]+)"/);
      if (contentMatch) {
        return contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
      return null;
    },
    
    // Strategy 4: Extract text from quoted text field
    () => {
      const textMatch = fullResponse.match(/"text":\s*"([^"]+)"/);
      if (textMatch) {
        return textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
      return null;
    },
    
    // Strategy 5: Extract from result field
    () => {
      const resultMatch = fullResponse.match(/"result":\s*"([^"]+)"/);
      if (resultMatch) {
        return resultMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
      return null;
    }
  ];
  
  // Try each extraction strategy
  for (let i = 0; i < extractStrategies.length; i++) {
    try {
      const result = extractStrategies[i]();
      if (result && result.trim()) {
        log.debug('Response extraction successful', { strategy: i + 1, resultLength: result.length, preview: result.substring(0, 100) + '...' });
        cleanResponse = result.trim();
        break;
      }
    } catch (e) {
      log.debug('Response extraction strategy failed', { strategy: i + 1, error: e instanceof Error ? e.message : String(e) });
    }
  }

  log.debug('Final clean response prepared', { length: cleanResponse.length, preview: cleanResponse.substring(0, 100) + '...' });
  return cleanResponse;
}

/**
 * Check if OAuth token is available and valid for Claude Code SDK
 */
export function canUseClaudeCodeSDK(authManager?: AuthManager): boolean {
  const auth = authManager || AuthManager.getInstance();
  const oauthToken = auth.getOAuthToken();
  return !!oauthToken;
}