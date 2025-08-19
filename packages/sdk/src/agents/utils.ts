import { z } from "zod";
import { ModelProvider } from "../types";

export interface ModelConfig {
  provider: ModelProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string; // for custom providers like OpenAI compatible
}

async function createProvider(config: ModelConfig) {
  switch (config.provider) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey: config.apiKey });
    }
    case "openai": {
      const { openai } = await import("@ai-sdk/openai");
      return openai.responses;
    }
    case "openrouter": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      return createOpenAICompatible({
        name: "openrouter",
        apiKey: config.apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
    }
    case "azure": {
      if (!config.baseUrl) {
        throw new Error("baseUrl is required for Azure provider");
      }
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      return createOpenAICompatible({
        name: "azure",
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
    }
    case "gemini": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      return createOpenAICompatible({
        name: "gemini",
        apiKey: config.apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
    }
    case "ollama": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      return createOpenAICompatible({
        name: "ollama",
        apiKey: config.apiKey || "ollama", // Ollama often doesn't require a real key
        baseURL: config.baseUrl || "http://localhost:11434/v1",
      });
    }
    case "mistral": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      return createOpenAICompatible({
        name: "mistral",
        apiKey: config.apiKey,
        baseURL: "https://api.mistral.ai/v1",
      });
    }
    case "deepseek": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      return createOpenAICompatible({
        name: "deepseek",
        apiKey: config.apiKey,
        baseURL: "https://api.deepseek.com/v1",
      });
    }
    case "xai": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      return createOpenAICompatible({
        name: "xai",
        apiKey: config.apiKey,
        baseURL: "https://api.x.ai/v1",
      });
    }
    case "groq": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      return createOpenAICompatible({
        name: "groq",
        apiKey: config.apiKey,
        baseURL: "https://api.groq.com/openai/v1",
      });
    }
    case "arceeai": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      return createOpenAICompatible({
        name: "arceeai",
        apiKey: config.apiKey,
        baseURL: "https://api.arcee.ai/v1",
      });
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

function getDefaultModel(provider: ModelProvider): string {
  switch (provider) {
    case "anthropic":
      return "claude-3-5-sonnet-20240620";
    case "openai":
      return "gpt-5";
    case "openrouter":
      return "anthropic/claude-3.5-sonnet";
    case "azure":
      return "gpt-4"; // This would typically be the deployment name
    case "gemini":
      return "gemini-1.5-pro";
    case "google":
      return "gemini-1.5-pro";
    case "ollama":
      return "llama3.1";
    case "mistral":
      return "mistral-large-latest";
    case "deepseek":
      return "deepseek-chat";
    case "xai":
      return "grok-beta";
    case "groq":
      return "llama-3.1-70b-versatile";
    case "arceeai":
      return "arcee-lite";
    default:
      return "gpt-4o-mini";
  }
}

export async function generatePRMetadata(
  patch: string,
  modelConfig: ModelConfig,
  prompt: string
) {
  const _prompt = `You are tasked to create title and body for a pull request based on the following task:\n${prompt}\n\npatch:\n\n${patch}`;
  
  // Check if we have OAuth token (Claude Code OAuth flow)
  const isOAuthToken = modelConfig.provider === 'anthropic' && 
                       modelConfig.apiKey?.startsWith('sk-ant-oat');
  
  if (isOAuthToken) {
    // Use Claude Code SDK with OAuth token
    try {
      const { query } = await import("@anthropic-ai/claude-code");
      
      const jsonPrompt = `${_prompt}\n\nRespond ONLY with a valid JSON object (no markdown, no explanation) with these fields:\n- title: PR title (max 50 chars)\n- body: PR description\n- branchName: branch name (lowercase, hyphens, no spaces)\n- commitMessage: commit message\n\nExample format:\n{"title":"Add feature X","body":"This PR adds...","branchName":"add-feature-x","commitMessage":"Add feature X"}`;
      
      let jsonResponse = '';
      const options: any = {
        authToken: modelConfig.apiKey,
        outputFormat: 'json',
        model: modelConfig.model || 'claude-3-5-sonnet-20241022',
        maxTurns: 1
      };
      
      for await (const message of query({
        prompt: jsonPrompt,
        ...options
      })) {
        // Messages can be objects with various types
        if (typeof message === 'string') {
          jsonResponse += message;
        } else if (typeof message === 'object' && message !== null) {
          // Extract text content from different message types
          const msgStr = JSON.stringify(message);
          if (msgStr.includes('{') && msgStr.includes('title')) {
            jsonResponse += msgStr;
          }
        }
      }
      
      console.log('Claude Code SDK raw response:', jsonResponse);
      
      // Try multiple JSON parsing strategies
      const parseStrategies = [
        // Strategy 1: Direct JSON parse (if response is already JSON)
        () => {
          const parsed = JSON.parse(jsonResponse);
          if (parsed.title && parsed.body && parsed.branchName && parsed.commitMessage) {
            return parsed;
          }
          return null;
        },
        
        // Strategy 2: Parse as escaped JSON in result field
        () => {
          const resultMatch = jsonResponse.match(/"result":"(\{.*?\})"/);
          if (resultMatch) {
            const unescapedResult = resultMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const metadata = JSON.parse(unescapedResult);
            if (metadata.title && metadata.body && metadata.branchName && metadata.commitMessage) {
              return metadata;
            }
          }
          return null;
        },
        
        // Strategy 3: Parse as escaped JSON in text field
        () => {
          const textMatch = jsonResponse.match(/"text":"(\{.*?\})"/);
          if (textMatch) {
            const unescapedText = textMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const metadata = JSON.parse(unescapedText);
            if (metadata.title && metadata.body && metadata.branchName && metadata.commitMessage) {
              return metadata;
            }
          }
          return null;
        },
        
        // Strategy 4: Find any JSON object in the response
        () => {
          const jsonMatch = jsonResponse.match(/\{[^{}]*"title"[^{}]*\}/);
          if (jsonMatch) {
            const metadata = JSON.parse(jsonMatch[0]);
            if (metadata.title && metadata.body && metadata.branchName && metadata.commitMessage) {
              return metadata;
            }
          }
          return null;
        },
        
        // Strategy 5: Extract JSON from various message formats
        () => {
          // Look for JSON in content field
          const contentMatch = jsonResponse.match(/"content":\s*"([^"]*\{[^"]*\})"/);
          if (contentMatch) {
            const unescaped = contentMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const metadata = JSON.parse(unescaped);
            if (metadata.title && metadata.body && metadata.branchName && metadata.commitMessage) {
              return metadata;
            }
          }
          return null;
        }
      ];
      
      // Try each parsing strategy
      for (let i = 0; i < parseStrategies.length; i++) {
        try {
          const result = parseStrategies[i]();
          if (result) {
            console.log(`Successfully parsed with strategy ${i + 1}:`, result);
            return result;
          }
        } catch (e) {
          console.log(`Parsing strategy ${i + 1} failed:`, e instanceof Error ? e.message : String(e));
        }
      }
      
      // If all strategies failed, throw error with the response for debugging
      console.error('All JSON parsing strategies failed. Response was:', jsonResponse);
      throw new Error('Failed to parse valid JSON from Claude Code SDK response');
    } catch (error) {
      // OAuth failed - throw error, no fallback
      throw new Error(`Failed to generate PR metadata with OAuth token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Standard API flow for regular API keys
  const provider = await createProvider(modelConfig);
  const model = getDefaultModel(modelConfig.provider);

  const { generateObject } = await import("ai");
  const { object } = await generateObject({
    model: provider(model),
    prompt: _prompt,
    schema: z.object({
      title: z.string().describe("Suggested title for the pull request"),
      body: z.string().describe("Suggested body for the pull request"),
      branchName: z
        .string()
        .describe(`Suggested branch name, should be unique and descriptive`),
      commitMessage: z
        .string()
        .describe("Suggested commit message for the pull request"),
    }),
  });

  return object;
}


export async function generateCommitMessage(
  patch: string,
  modelConfig: ModelConfig,
  prompt: string
) {
  const _prompt = `You are tasked to create a commit message based on the following task:\n${prompt}\n\npatch:\n\n${patch}`;
  
  // Check if we have OAuth token (Claude Code OAuth flow)
  const isOAuthToken = modelConfig.provider === 'anthropic' && 
                       modelConfig.apiKey?.startsWith('sk-ant-oat');
  
  if (isOAuthToken) {
    // Use Claude Code SDK with OAuth token
    try {
      const { query } = await import("@anthropic-ai/claude-code");
      
      const jsonPrompt = `${_prompt}\n\nRespond ONLY with a valid JSON object (no markdown, no explanation) with this field:\n- commitMessage: commit message\n\nExample format:\n{"commitMessage":"Fix bug in user authentication"}`;
      
      let jsonResponse = '';
      const options: any = {
        authToken: modelConfig.apiKey,
        outputFormat: 'json',
        model: modelConfig.model || 'claude-3-5-sonnet-20241022',
        maxTurns: 1
      };
      
      for await (const message of query({
        prompt: jsonPrompt,
        ...options
      })) {
        if (typeof message === 'string') {
          jsonResponse += message;
        } else if (typeof message === 'object' && message !== null) {
          const msgStr = JSON.stringify(message);
          if (msgStr.includes('{') && msgStr.includes('commitMessage')) {
            jsonResponse += msgStr;
          }
        }
      }
      
      // Parse the JSON response
      const jsonMatch = jsonResponse.match(/\{"commitMessage":[^}]+\}/);
      if (jsonMatch) {
        const metadata = JSON.parse(jsonMatch[0]);
        if (metadata.commitMessage) {
          return metadata;
        }
      }
    } catch (error) {
      console.error('Failed to generate commit message with Claude Code SDK:', error);
      // OAuth failed - throw error, no fallback
      throw new Error(`Failed to generate commit message with OAuth token: ${error}`);
    }
  }
  
  // Standard API flow for regular API keys
  const provider = await createProvider(modelConfig);
  const model = modelConfig.model || getDefaultModel(modelConfig.provider);

  const { generateObject } = await import("ai");
  const { object } = await generateObject({
    model: provider(model),
    prompt: _prompt,
    schema: z.object({
      commitMessage: z
        .string()
        .describe("Suggested commit message for the changes"),
    }),
  });

  return object;
}
