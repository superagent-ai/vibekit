import { BaseAgent, BaseAgentConfig, AgentCommandConfig, ExecuteCommandOptions, AgentResponse, StreamCallbacks } from "./base";
import { ModelConfig } from "./utils";
import {
  AgentType,
  ClaudeConfig,
  ClaudeResponse,
  ClaudeStreamCallbacks,
  Conversation,
  ModelProvider,
  SandboxInstance,
} from "../types";

export class ClaudeAgent extends BaseAgent {
  private anthropicApiKey?: string;
  private oauthToken?: string;
  private model?: string;
  private useOAuth: boolean;
  private tokenInitialized: boolean = false;
  protected declare config: ClaudeConfig;

  private escapePrompt(prompt: string): string {
    // Escape backticks and other special characters
    return prompt.replace(/[`"$\\]/g, "\\$&");
  }

  constructor(config: ClaudeConfig) {
    console.log('[Claude] Agent constructor called with MCP config:', !!config.mcpConfig);
    
    const baseConfig: BaseAgentConfig = {
      githubToken: config.githubToken,
      repoUrl: config.repoUrl,
      sandboxProvider: config.sandboxProvider,
      secrets: config.secrets,
      sandboxId: config.sandboxId,
      telemetry: config.telemetry,
      workingDirectory: config.workingDirectory,
      mcpConfig: config.mcpConfig,
    };

    super(baseConfig);

    // Validate that provider is anthropic if specified (Claude only supports anthropic)
    if (config.provider && config.provider !== "anthropic") {
      throw new Error("Claude agent only supports 'anthropic' provider");
    }

    // Store config values
    const envOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    this.oauthToken = config.oauthToken || envOAuthToken;
    this.anthropicApiKey = config.providerApiKey;
    this.model = config.model;
    
    // Perform a preliminary check to set useOAuth based on the presence of oauthToken and absence of anthropicApiKey.
    // The final determination of the authentication method is made in initializeToken().
    this.useOAuth = !!(this.oauthToken && !this.anthropicApiKey);
  }
  
  private async initializeToken(): Promise<void> {
    if (this.tokenInitialized) return;
    
    // No automatic OAuth token loading - users must provide tokens themselves
    
    // Determine which auth method to use
    this._determineAuthMethod();
  }

  /**
   * Determines the authentication method to use (OAuth or API key).
   * Sets the `useOAuth` flag based on the available credentials.
   */
  private _determineAuthMethod(): void {
    if (this.oauthToken) {
      this.useOAuth = true;
    } else if (this.anthropicApiKey) {
      this.useOAuth = false;
    } else {
      throw new Error(
        "Claude agent requires either providerApiKey or oauthToken. Run 'vibekit auth claude' to authenticate."
      );
    }
    
    // Validate that at least one auth method is provided
    if (!this.anthropicApiKey && !this.oauthToken) {
      throw new Error(
        "Claude agent requires either providerApiKey or oauthToken. Run 'vibekit auth claude' to authenticate."
      );
    }
    
    this.tokenInitialized = true;
  }

  protected getCommandConfig(
    prompt: string,
    mode?: "ask" | "code"
  ): AgentCommandConfig {
    let instruction: string;
    if (mode === "ask") {
      instruction =
        "Research the repository and answer the user's questions. " +
        "Do NOT make any changes to any files in the repository.";
    } else {
      instruction =
        "Do the necessary changes to the codebase based on the users input.\n" +
        "Don't ask any follow up questions.";
    }
    
    // Add Claude Code system prompt when using OAuth
    if (this.useOAuth) {
      instruction = "You are Claude Code, Anthropic's official CLI for Claude. " + instruction;
    }

    const escapedPrompt = this.escapePrompt(prompt);

    // Setup MCP config file before running claude if needed
    let setupCommand = "";
    if (this.config.mcpConfig && !this.mcpSetupComplete) {
      const mcpConfig: Record<string, any> = {
        mcpServers: {}
      };
      
      const servers = Array.isArray(this.config.mcpConfig.servers)
        ? this.config.mcpConfig.servers
        : [this.config.mcpConfig.servers];
      
      for (const server of servers) {
        if (server.name && server.command) {
          mcpConfig.mcpServers[server.name] = {
            command: server.command,
            args: server.args || []
          };
        }
      }
      
      const mcpConfigJson = JSON.stringify(mcpConfig, null, 2).replace(/'/g, "'\"'\"'");
      setupCommand = `echo '${mcpConfigJson}' > ${this.WORKING_DIR}/.mcp.json && `;
      this.mcpSetupComplete = true;
    }

    // Build command with optional MCP config
    let claudeCommand = `cd ${this.WORKING_DIR} && echo "${escapedPrompt}" | claude -p --append-system-prompt "${instruction}" --model ${
      this.model || "claude-3-5-sonnet-20241022"
    }`;
    
    // Add MCP config if available
    if (this.config.mcpConfig) {
      claudeCommand += ` --mcp-config ${this.WORKING_DIR}/.mcp.json`;
    }

    return {
      command: setupCommand + claudeCommand,
      errorPrefix: "Claude",
      labelName: "claude",
      labelColor: "FF6B35",
      labelDescription: "Generated by Claude AI agent",
    };
  }

  protected getDefaultTemplate(): string {
    return "vibekit-claude";
  }

  protected getEnvironmentVariables(): Record<string, string> {
    const envVars: Record<string, string> = {};
    
    if (this.useOAuth) {
      // For OAuth, pass the token as CLAUDE_CODE_OAUTH_TOKEN
      envVars.CLAUDE_CODE_OAUTH_TOKEN = this.oauthToken!;
    } else {
      // For API key authentication
      envVars.ANTHROPIC_API_KEY = this.anthropicApiKey!;
    }
    
    return envVars;
  }

  protected getApiKey(): string {
    // Return OAuth token if using OAuth, otherwise API key
    return this.useOAuth ? this.oauthToken! : this.anthropicApiKey!;
  }

  protected getAgentType(): AgentType {
    return "claude";
  }

  protected getModelConfig(): ModelConfig {
    return {
      provider: "anthropic",
      apiKey: this.useOAuth ? this.oauthToken! : this.anthropicApiKey!,
      model: this.model,
    };
  }

  // Override onSandboxReady to set up Claude-specific MCP configuration
  protected async onSandboxReady(sandbox: SandboxInstance): Promise<void> {
    console.log('[Claude] onSandboxReady called');
    // Don't setup MCP here - it interferes with git clone
    // MCP setup will happen later when needed
  }

  private mcpSetupComplete = false;



}
