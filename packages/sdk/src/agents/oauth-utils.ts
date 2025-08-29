import { ModelConfig } from "./utils";

/**
 * Optimized JSON parsing with fallback strategies
 * Reduces bundle size by using more efficient parsing
 */
function parseJsonResponse(content: string, requiredFields: string[]): any {
  // Quick validation
  if (!content?.trim()) return null;

  const strategies = [
    // Direct parse (most common case)
    () => JSON.parse(content),
    // Extract from code block
    () => {
      const match = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      return match ? JSON.parse(match[1]) : null;
    },
    // Find JSON in text with flexible pattern
    () => {
      const pattern = new RegExp(`\\{[^{}]*${requiredFields.map(f => `"${f}"`).join('[^{}]*')}[^{}]*\\}`);
      const match = content.match(pattern);
      return match ? JSON.parse(match[0]) : null;
    },
    // Clean and parse
    () => {
      const cleaned = content.trim().replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      return JSON.parse(cleaned);
    }
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy();
      // Validate required fields exist
      if (result && requiredFields.every(field => result[field])) {
        return result;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Execute Claude Code SDK query with optimized options
 */
async function executeClaudeQuery(prompt: string, modelConfig: ModelConfig): Promise<string> {
  try {
    const { query } = await import("@anthropic-ai/claude-code");
    
    const options = {
      authToken: modelConfig.apiKey,
      outputFormat: 'text' as const,
      model: modelConfig.model || 'claude-sonnet-4-20250514',
      maxTurns: 1
    };

    for await (const message of query({ prompt, ...options })) {
      if (message?.type === 'result' && 'result' in message && typeof message.result === 'string') {
        return message.result;
      }
    }
    
    return '';
  } catch (error: any) {
    if (error?.code === 'MODULE_NOT_FOUND' || error?.message?.includes('@anthropic-ai/claude-code')) {
      throw new Error(
        'OAuth functionality requires @anthropic-ai/claude-code to be installed. ' +
        'Install it with: npm install @anthropic-ai/claude-code@^1.0.96'
      );
    }
    throw error;
  }
}

/**
 * Generate PR metadata using Claude Code SDK (OAuth flow)
 * Optimized for smaller bundle size and better performance
 */
export async function generatePRMetadataWithOAuth(
  patch: string,
  modelConfig: ModelConfig,
  prompt: string
): Promise<{ title: string; body: string; branchName: string; commitMessage: string }> {
  const fullPrompt = `${prompt}\n\npatch:\n\n${patch}

Respond ONLY with valid JSON (no markdown, no explanation) with these fields:
- title: PR title (max 50 chars)  
- body: PR description
- branchName: branch name (lowercase, hyphens, no spaces)
- commitMessage: commit message

Example: {"title":"Add feature X","body":"This PR adds...","branchName":"add-feature-x","commitMessage":"Add feature X"}`;

  try {
    const content = await executeClaudeQuery(fullPrompt, modelConfig);
    const result = parseJsonResponse(content, ['title', 'body', 'branchName', 'commitMessage']);
    
    if (!result) {
      throw new Error(`Invalid response format. Got: ${content.substring(0, 200)}`);
    }
    
    return result;
  } catch (error) {
    throw new Error(`OAuth PR metadata generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate commit message using Claude Code SDK (OAuth flow)
 * Optimized for smaller bundle size and better performance
 */
export async function generateCommitMessageWithOAuth(
  patch: string,
  modelConfig: ModelConfig,
  prompt: string
): Promise<{ commitMessage: string }> {
  const fullPrompt = `${prompt}\n\npatch:\n\n${patch}

Respond ONLY with valid JSON (no markdown, no explanation) with this field:
- commitMessage: commit message

Example: {"commitMessage":"Fix bug in user authentication"}`;

  try {
    const content = await executeClaudeQuery(fullPrompt, modelConfig);
    const result = parseJsonResponse(content, ['commitMessage']);
    
    if (!result) {
      throw new Error(`Invalid response format`);
    }
    
    return result;
  } catch (error) {
    throw new Error(`OAuth commit message generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if the provided API key is an OAuth token
 */
export function isOAuthToken(modelConfig: ModelConfig): boolean {
  return modelConfig.provider === 'anthropic' && 
         !!modelConfig.apiKey?.startsWith('sk-ant-oat');
}