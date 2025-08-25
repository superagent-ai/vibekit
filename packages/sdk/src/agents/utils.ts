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
      
      let resultContent = '';
      const options: any = {
        authToken: modelConfig.apiKey,
        outputFormat: 'text', // Get plain text response for easier JSON parsing
        model: modelConfig.model || 'claude-sonnet-4-20250514',
        maxTurns: 1
      };
      
      for await (const message of query({
        prompt: jsonPrompt,
        ...options
      })) {
        // The SDK returns multiple message objects
        // We want the 'result' field from the final message with type: 'result'
        if (typeof message === 'object' && message !== null && message.type === 'result') {
          // Type guard to check if result property exists
          if ('result' in message && typeof message.result === 'string') {
            resultContent = message.result;
          }
        }
      }
      
      // Try multiple JSON parsing strategies
      const parseStrategies = [
        // Strategy 1: Direct JSON parse (resultContent should be valid JSON)
        () => {
          const parsed = JSON.parse(resultContent);
          if (parsed.title && parsed.body && parsed.branchName && parsed.commitMessage) {
            return parsed;
          }
          return null;
        },
        
        // Strategy 2: Extract JSON from markdown code block
        () => {
          const codeBlockMatch = resultContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (codeBlockMatch) {
            const metadata = JSON.parse(codeBlockMatch[1]);
            if (metadata.title && metadata.body && metadata.branchName && metadata.commitMessage) {
              return metadata;
            }
          }
          return null;
        },
        
        // Strategy 3: Find JSON object in the text (might have extra text around it)
        () => {
          const jsonMatch = resultContent.match(/\{[^{}]*"title"[^{}]*"body"[^{}]*"branchName"[^{}]*"commitMessage"[^{}]*\}/);
          if (jsonMatch) {
            const metadata = JSON.parse(jsonMatch[0]);
            if (metadata.title && metadata.body && metadata.branchName && metadata.commitMessage) {
              return metadata;
            }
          }
          return null;
        },
        
        // Strategy 4: Clean common issues and try again
        () => {
          // Remove potential markdown formatting or extra whitespace
          let cleaned = resultContent.trim();
          // Remove any leading/trailing non-JSON characters
          cleaned = cleaned.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
          const metadata = JSON.parse(cleaned);
          if (metadata.title && metadata.body && metadata.branchName && metadata.commitMessage) {
            return metadata;
          }
          return null;
        }
      ];
      
      // Try each parsing strategy
      for (let i = 0; i < parseStrategies.length; i++) {
        try {
          const result = parseStrategies[i]();
          if (result) {
            return result;
          }
        } catch (e) {
          // Continue to next strategy
        }
      }
      
      // If all strategies failed, throw error with the response for debugging
      throw new Error(`Failed to parse valid JSON from Claude Code SDK response. Response was: ${resultContent.substring(0, 200)}`);
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
      
      let resultContent = '';
      const options: any = {
        authToken: modelConfig.apiKey,
        outputFormat: 'text', // Get plain text response for easier JSON parsing
        model: modelConfig.model || 'claude-sonnet-4-20250514',
        maxTurns: 1
      };
      
      for await (const message of query({
        prompt: jsonPrompt,
        ...options
      })) {
        // The SDK returns multiple message objects
        // We want the 'result' field from the final message with type: 'result'
        if (typeof message === 'object' && message !== null && message.type === 'result') {
          // Type guard to check if result property exists
          if ('result' in message && typeof message.result === 'string') {
            resultContent = message.result;
          }
        }
      }
      
      // Try to parse the JSON response
      try {
        // Try direct parse first
        const metadata = JSON.parse(resultContent);
        if (metadata.commitMessage) {
          return metadata;
        }
      } catch {
        // Try to extract JSON from the response
        const jsonMatch = resultContent.match(/\{"commitMessage":[^}]+\}/);
        if (jsonMatch) {
          const metadata = JSON.parse(jsonMatch[0]);
          if (metadata.commitMessage) {
            return metadata;
          }
        }
      }
      
      throw new Error(`Failed to parse commit message from Claude Code SDK response`);
    } catch (error) {
      // OAuth failed - throw error, no fallback
      throw new Error(`Failed to generate commit message with OAuth token: ${error instanceof Error ? error.message : String(error)}`);
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
