// Tool interface definition
export interface Tool {
  name: string;
  injectToSandbox?: (sandboxConfig: any) => void | Promise<void>;
  execute?: (command: string, parameters?: any) => Promise<any>;
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

// MCP Tool implementation
import { mcpService } from "./mcp";

export const mcpTool: Tool = {
  name: "mcp",
  injectToSandbox: async (sandboxConfig) => {
    if (!sandboxConfig.envs) sandboxConfig.envs = {};
    sandboxConfig.envs.MCP_ENABLED = "1";
    sandboxConfig.envs.MCP_SERVICE_URL = "http://localhost:3001"; // Default MCP server
  },
  execute: async (command, parameters) => {
    return await mcpService.executeTool(command, parameters);
  }
};

toolingManager.registerTool(mcpTool);

 