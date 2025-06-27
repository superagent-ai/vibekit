import { Sandbox } from '@e2b/code-interpreter'

// Create a new E2B sandbox
export const createSandbox = async (options?: {
  apiKey?: string;
  metadata?: Record<string, any>;
  timeoutMs?: number;
}) => {
  try {
    // Ensure all metadata values are strings
    const stringMetadata: Record<string, string> = {};
    if (options?.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        stringMetadata[key] = String(value);
      }
    }
    
    const sandbox = await Sandbox.create({
      apiKey: options?.apiKey || process.env.E2B_API_KEY!,
      metadata: stringMetadata,
      timeoutMs: options?.timeoutMs || 60 * 60 * 1000, // Default 1 hour
    });

    return {
      sandbox,
      metadata: {
        sandboxId: sandbox.sandboxId,
        ...stringMetadata,
      }
    };
  } catch (error) {
    console.error('[createSandbox] Failed to create sandbox:', error);
    throw error;
  }
}

// Run code in a sandbox
export const runCode = async (sandbox: Sandbox, code: string) => {
  try {
    const result = await sandbox.runCode(code);
    
    // Extract results and errors
    const results = result.results || [];
    const error = result.error;
    
    return {
      results,
      error,
      // Legacy compatibility
      result: error ? 'error' : 'success',
      output: results.map(r => r.data).join('\n'),
      exitCode: error ? 1 : 0,
    };
  } catch (error) {
    console.error('[runCode] Failed to run code:', error);
    return {
      results: [],
      error: {
        type: 'execution',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      result: 'error',
      output: '',
      exitCode: 1,
    };
  }
}
