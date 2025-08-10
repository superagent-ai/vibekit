import { MCPClientManager, MCP_CLIENT_VERSION } from '@vibe-kit/mcp-client';

let manager: MCPClientManager | null = null;

export async function getManager(): Promise<MCPClientManager> {
  if (!manager) {
    console.log('[API] Creating MCPClientManager with version:', MCP_CLIENT_VERSION);
    console.log('[API] Config path:', process.env.MCP_CONFIG_PATH || 'default');
    
    manager = new MCPClientManager({
      configPath: process.env.MCP_CONFIG_PATH,
      // Maintain backward compatibility with .vibekit directory
      configDir: '.vibekit',
      configFileName: 'mcp-servers.json',
      clientName: 'vibekit-mcp-client',
      metadataKey: '_vibekit_metadata',
      autoConnect: false,
    });
    
    await manager.initialize();
    console.log('[API] MCPClientManager initialized');
  }
  return manager;
}

// Helper to resolve params for Next.js 15 compatibility
export async function resolveParams<T>(params: Promise<T> | T): Promise<T> {
  return 'then' in params ? await params : params;
}