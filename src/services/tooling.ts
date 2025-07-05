// Tool interface definition
export interface Tool {
  name: string;
  injectToSandbox?: (sandboxConfig: any) => void | Promise<void>;
  // Additional properties/methods as needed
}

// ToolingManager for registering and retrieving tools
type ToolRegistry = Record<string, Tool>;

export class ToolingManager {
  private tools: ToolRegistry = {};

  registerTool(tool: Tool) {
    this.tools[tool.name] = tool;
  }

  unregisterTool(name: string) {
    delete this.tools[name];
  }

  getTool(name: string): Tool | undefined {
    return this.tools[name];
  }

  // Get all tools for a given sandbox config (e.g., by config.tools or other logic)
  getToolsForSandbox(config: { tools?: string[] }): Tool[] {
    if (!config.tools) return [];
    return config.tools.map((name) => this.tools[name]).filter(Boolean) as Tool[];
  }

  // Inject all tools for a sandbox config (calls injectToSandbox if present)
  async injectTools(config: { tools?: string[] }) {
    const tools = this.getToolsForSandbox(config);
    for (const tool of tools) {
      if (tool.injectToSandbox) {
        await tool.injectToSandbox(config);
      }
    }
  }
}

// Singleton instance
export const toolingManager = new ToolingManager();

// Example MCP tool
export const mcpTool: Tool = {
  name: "mcp",
  injectToSandbox: async (sandboxConfig) => {
    // Placeholder: In a real implementation, modify envs, mount files, etc.
    if (!sandboxConfig.envs) sandboxConfig.envs = {};
    sandboxConfig.envs.MCP_ENABLED = "1";
    // You could also mount binaries, scripts, etc. here
    console.log("MCP tool injected into sandbox config");
  },
};

toolingManager.registerTool(mcpTool); 