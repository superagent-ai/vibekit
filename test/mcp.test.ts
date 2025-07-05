import { describe, it, expect, beforeEach } from "vitest";
import { toolingManager, Tool } from "../src/services/tooling";
import { mcpService, MCPTool } from "../src/services/mcp";
import { BaseAgent, BaseAgentConfig } from "../src/agents/base";
import { SandboxConfig } from "../src/types";

// Mock sandbox instance for testing
class MockSandboxInstance {
  sandboxId = "test-sandbox";
  commands = {
    run: async (command: string) => ({
      exitCode: 0,
      stdout: command.includes("MCP_ENABLED") ? "1" : "test output",
      stderr: ""
    })
  };
  async kill() {}
  async pause() {}
  async getHost() { return "localhost"; }
}

// Mock agent for testing
class MockAgent extends BaseAgent {
  protected getCommandConfig() {
    return {
      command: "test",
      errorPrefix: "Test",
      labelName: "test",
      labelColor: "#000000",
      labelDescription: "Test"
    };
  }
  protected getDefaultTemplate() { return "test"; }
  protected getEnvironmentVariables() { return {}; }
  protected getApiKey() { return "test"; }
  protected getAgentType() { return "claude" as const; }
  protected getModelConfig() { return { provider: "anthropic" as const, apiKey: "test" }; }
}

describe("MCP Tooling System", () => {
  beforeEach(() => {
    // Clear any existing tools
    toolingManager.unregisterTool("mcp");
  });

  describe("ToolingManager", () => {
    it("should register and retrieve tools", () => {
      const testTool: Tool = {
        name: "test-tool",
        injectToSandbox: async () => {},
        execute: async () => ({ success: true })
      };

      toolingManager.registerTool(testTool);
      const retrieved = toolingManager.getTool("test-tool");
      
      expect(retrieved).toBe(testTool);
    });

    it("should get tools for sandbox config", () => {
      const testTool: Tool = {
        name: "test-tool",
        injectToSandbox: async () => {}
      };

      toolingManager.registerTool(testTool);
      
      const config = { tools: ["test-tool"] };
      const tools = toolingManager.getToolsForSandbox(config);
      
      expect(tools).toHaveLength(1);
      expect(tools[0]).toBe(testTool);
    });

    it("should handle missing tools gracefully", () => {
      const config = { tools: ["nonexistent-tool"] };
      const tools = toolingManager.getToolsForSandbox(config);
      
      expect(tools).toHaveLength(0);
    });
  });

  describe("MCPService", () => {
    it("should register MCP servers", async () => {
      await mcpService.registerServer("test-server", "http://localhost:3001");
      
      const tools = mcpService.getAvailableTools();
      expect(tools).toBeDefined();
    });

    it("should execute MCP tools", async () => {
      const result = await mcpService.executeTool("test-tool", { param: "value" });
      
      expect(result.success).toBe(true);
      expect(result.tool).toBe("test-tool");
    });
  });

  describe("MCP Tool Integration", () => {
    it("should inject MCP environment variables", async () => {
      const mcpTool: Tool = {
        name: "mcp",
        injectToSandbox: async (config) => {
          if (!config.envs) config.envs = {};
          config.envs.MCP_ENABLED = "1";
        }
      };

      toolingManager.registerTool(mcpTool);
      
      const config: SandboxConfig = {
        type: "e2b",
        apiKey: "test",
        tools: ["mcp"]
      };

      await toolingManager.injectTools(config);
      
      expect(config.envs?.MCP_ENABLED).toBe("1");
    });
  });

  describe("Agent MCP Integration", () => {
    it("should detect MCP tools in sandbox", async () => {
      const config: BaseAgentConfig = {
        sandboxConfig: {
          type: "e2b",
          apiKey: "test",
          tools: ["mcp"]
        }
      };

      const agent = new MockAgent(config);
      
      // Mock the sandbox instance
      (agent as any).sandboxInstance = new MockSandboxInstance();
      
      const hasMCP = await agent.hasMCPTools();
      expect(hasMCP).toBe(true);
    });

    it("should execute commands with MCP context", async () => {
      const config: BaseAgentConfig = {
        sandboxConfig: {
          type: "e2b",
          apiKey: "test",
          tools: ["mcp"]
        }
      };

      const agent = new MockAgent(config);
      
      // Mock the sandbox instance
      (agent as any).sandboxInstance = new MockSandboxInstance();
      
      const result = await agent.executeWithMCP("echo 'test'");
      
      expect(result.exitCode).toBe(0);
      expect(result.sandboxId).toBe("test-sandbox");
    });
  });

  describe("End-to-End MCP Flow", () => {
    it("should handle complete MCP tool injection and usage", async () => {
      // 1. Register MCP tool
      const mcpTool: Tool = {
        name: "mcp",
        injectToSandbox: async (config) => {
          if (!config.envs) config.envs = {};
          config.envs.MCP_ENABLED = "1";
          config.envs.MCP_SERVICE_URL = "http://localhost:3001";
        },
        execute: async (command) => ({ success: true, command })
      };

      toolingManager.registerTool(mcpTool);

      // 2. Create agent config with MCP
      const agentConfig: BaseAgentConfig = {
        sandboxConfig: {
          type: "e2b",
          apiKey: "test",
          tools: ["mcp"]
        }
      };

      // 3. Test tool injection
      await toolingManager.injectTools(agentConfig.sandboxConfig);
      expect(agentConfig.sandboxConfig.envs?.MCP_ENABLED).toBe("1");

      // 4. Test agent integration
      const agent = new MockAgent(agentConfig);
      (agent as any).sandboxInstance = new MockSandboxInstance();
      
      const hasMCP = await agent.hasMCPTools();
      expect(hasMCP).toBe(true);
    });
  });
}); 