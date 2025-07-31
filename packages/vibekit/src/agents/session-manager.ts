/**
 * Agent Session Management
 *
 * Manages agent sessions, sandbox assignments, and session recovery
 * for local sandbox environments.
 */

import { Environment } from "@vibe-kit/dagger";
import { MCPServerInstance } from "./local-mcp";
import { BaseAgent } from "./base";

export interface AgentSession {
  id: string;
  agentType: "claude" | "codex" | "opencode" | "gemini" | "grok";
  environment: Environment;
  mcpServer?: MCPServerInstance;
  agent?: BaseAgent;
  createdAt: Date;
  lastActivity: Date;
  status: "active" | "idle" | "suspended" | "terminated";
  metadata: {
    workingDirectory?: string;
    branch?: string;
    lastPrompt?: string;
    commandCount: number;
  };
}

export interface SessionFilter {
  agentType?: string;
  environmentName?: string;
  status?: AgentSession["status"];
  olderThan?: Date;
  newerThan?: Date;
}

export interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  idleSessions: number;
  byAgentType: Record<string, number>;
  byEnvironment: Record<string, number>;
  averageCommandsPerSession: number;
}

/**
 * Agent Session Manager
 */
export class AgentSessionManager {
  private sessions: Map<string, AgentSession> = new Map();
  private environmentAssignments: Map<string, string[]> = new Map(); // env name -> session IDs
  private agentSessions: Map<string, string> = new Map(); // agent instance -> session ID

  /**
   * Create a new agent session
   */
  createSession(
    agentType: AgentSession["agentType"],
    environment: Environment,
    mcpServer?: MCPServerInstance,
    agent?: BaseAgent
  ): AgentSession {
    const sessionId = this.generateSessionId(agentType, environment);

    const session: AgentSession = {
      id: sessionId,
      agentType,
      environment,
      mcpServer,
      agent,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: "active",
      metadata: {
        commandCount: 0,
      },
    };

    this.sessions.set(sessionId, session);

    // Track environment assignments
    const envSessions = this.environmentAssignments.get(environment.name) || [];
    envSessions.push(sessionId);
    this.environmentAssignments.set(environment.name, envSessions);

    // Track agent instance if provided
    if (agent) {
      this.agentSessions.set(this.getAgentInstanceId(agent), sessionId);
    }

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by agent instance
   */
  getSessionByAgent(agent: BaseAgent): AgentSession | undefined {
    const agentId = this.getAgentInstanceId(agent);
    const sessionId = this.agentSessions.get(agentId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Get sessions for environment
   */
  getSessionsForEnvironment(environmentName: string): AgentSession[] {
    const sessionIds = this.environmentAssignments.get(environmentName) || [];
    return sessionIds
      .map((id) => this.sessions.get(id))
      .filter((session): session is AgentSession => session !== undefined);
  }

  /**
   * Update session activity
   */
  updateSessionActivity(
    sessionId: string,
    metadata?: Partial<AgentSession["metadata"]>
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      session.metadata.commandCount++;

      if (metadata) {
        session.metadata = { ...session.metadata, ...metadata };
      }

      // Auto-update status based on activity
      if (session.status === "idle") {
        session.status = "active";
      }
    }
  }

  /**
   * Set session status
   */
  setSessionStatus(sessionId: string, status: AgentSession["status"]): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastActivity = new Date();
    }
  }

  /**
   * Suspend session (keep data, stop activity)
   */
  suspendSession(sessionId: string): void {
    this.setSessionStatus(sessionId, "suspended");
  }

  /**
   * Resume suspended session
   */
  resumeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.status === "suspended") {
      session.status = "active";
      session.lastActivity = new Date();
    }
  }

  /**
   * Terminate session and cleanup resources
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Cleanup agent resources
    if (session.agent) {
      try {
        await session.agent.killSandbox();
      } catch (error) {
        console.warn(
          `Failed to cleanup agent for session ${sessionId}: ${error}`
        );
      }
    }

    // Cleanup MCP server
    if (session.mcpServer) {
      try {
        const { cleanupMCPForEnvironment } = await import("./local-mcp");
        await cleanupMCPForEnvironment(session.environment);
      } catch (error) {
        console.warn(
          `Failed to cleanup MCP server for session ${sessionId}: ${error}`
        );
      }
    }

    // Remove from tracking
    this.sessions.delete(sessionId);

    // Clean up environment assignments
    const envSessions =
      this.environmentAssignments.get(session.environment.name) || [];
    const updatedSessions = envSessions.filter((id) => id !== sessionId);
    if (updatedSessions.length === 0) {
      this.environmentAssignments.delete(session.environment.name);
    } else {
      this.environmentAssignments.set(
        session.environment.name,
        updatedSessions
      );
    }

    // Clean up agent tracking
    if (session.agent) {
      const agentId = this.getAgentInstanceId(session.agent);
      this.agentSessions.delete(agentId);
    }
  }

  /**
   * List sessions with optional filtering
   */
  listSessions(filter?: SessionFilter): AgentSession[] {
    let sessions = Array.from(this.sessions.values());

    if (filter) {
      if (filter.agentType) {
        sessions = sessions.filter((s) => s.agentType === filter.agentType);
      }

      if (filter.environmentName) {
        sessions = sessions.filter(
          (s) => s.environment.name === filter.environmentName
        );
      }

      if (filter.status) {
        sessions = sessions.filter((s) => s.status === filter.status);
      }

      if (filter.olderThan) {
        sessions = sessions.filter((s) => s.createdAt < filter.olderThan!);
      }

      if (filter.newerThan) {
        sessions = sessions.filter((s) => s.createdAt > filter.newerThan!);
      }
    }

    return sessions.sort(
      (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
    );
  }

  /**
   * Cleanup idle sessions
   */
  async cleanupIdleSessions(
    idleThresholdMinutes: number = 30
  ): Promise<number> {
    const idleThreshold = new Date(
      Date.now() - idleThresholdMinutes * 60 * 1000
    );
    const idleSessions = this.listSessions({
      status: "active",
      olderThan: idleThreshold,
    });

    let cleanedCount = 0;
    for (const session of idleSessions) {
      if (session.lastActivity < idleThreshold) {
        session.status = "idle";
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get session metrics
   */
  getMetrics(): SessionMetrics {
    const sessions = Array.from(this.sessions.values());

    const byAgentType: Record<string, number> = {};
    const byEnvironment: Record<string, number> = {};
    let totalCommands = 0;
    let activeSessions = 0;
    let idleSessions = 0;

    for (const session of sessions) {
      // Count by agent type
      byAgentType[session.agentType] =
        (byAgentType[session.agentType] || 0) + 1;

      // Count by environment
      byEnvironment[session.environment.name] =
        (byEnvironment[session.environment.name] || 0) + 1;

      // Accumulate commands
      totalCommands += session.metadata.commandCount;

      // Count by status
      if (session.status === "active") activeSessions++;
      if (session.status === "idle") idleSessions++;
    }

    return {
      totalSessions: sessions.length,
      activeSessions,
      idleSessions,
      byAgentType,
      byEnvironment,
      averageCommandsPerSession:
        sessions.length > 0 ? totalCommands / sessions.length : 0,
    };
  }

  /**
   * Recover sessions after restart
   */
  async recoverSessions(): Promise<number> {
    // This would typically load session state from persistent storage
    // For now, we'll implement a basic recovery that checks for running environments

    try {
      const { createLocalProvider } = await import("@vibe-kit/dagger");
      const provider = createLocalProvider();
      const environments = await provider.listEnvironments();

      let recoveredCount = 0;

      for (const env of environments) {
        if (env.status === "running") {
          // Try to recover session for running environment
          const agentType = env.environment?.VIBEKIT_AGENT_TYPE || "codex";

          // Check if we already have a session for this environment
          const existingSessions = this.getSessionsForEnvironment(env.name);
          if (existingSessions.length === 0) {
            this.createSession(agentType as any, env);
            recoveredCount++;
          }
        }
      }

      return recoveredCount;
    } catch (error) {
      console.warn(`Failed to recover sessions: ${error}`);
      return 0;
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(
    agentType: string,
    environment: Environment
  ): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session-${agentType}-${environment.name}-${timestamp}-${random}`;
  }

  /**
   * Get unique identifier for agent instance
   */
  private getAgentInstanceId(agent: BaseAgent): string {
    // Use a combination of constructor name and creation time
    return `${agent.constructor.name}-${
      Object.getOwnPropertyNames(agent).length
    }`;
  }

  /**
   * Export session data for persistence
   */
  exportSessions(): any[] {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      agentType: session.agentType,
      environmentName: session.environment.name,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      status: session.status,
      metadata: session.metadata,
    }));
  }

  /**
   * Import session data from persistence
   */
  async importSessions(sessionData: any[]): Promise<number> {
    let importedCount = 0;

    for (const data of sessionData) {
      try {
        // We would need to recreate the Environment and MCP server
        // This is a simplified version
        console.log(
          `Importing session ${data.id} for environment ${data.environmentName}`
        );
        importedCount++;
      } catch (error) {
        console.warn(`Failed to import session ${data.id}: ${error}`);
      }
    }

    return importedCount;
  }
}

/**
 * Global session manager instance
 */
export const globalSessionManager = new AgentSessionManager();

/**
 * Session management utilities
 */

/**
 * Create and track agent session
 */
export function createAgentSession(
  agentType: AgentSession["agentType"],
  environment: Environment,
  mcpServer?: MCPServerInstance,
  agent?: BaseAgent
): AgentSession {
  return globalSessionManager.createSession(
    agentType,
    environment,
    mcpServer,
    agent
  );
}

/**
 * Get session for agent
 */
export function getAgentSession(agent: BaseAgent): AgentSession | undefined {
  return globalSessionManager.getSessionByAgent(agent);
}

/**
 * Update agent activity
 */
export function updateAgentActivity(
  agent: BaseAgent,
  metadata?: Partial<AgentSession["metadata"]>
): void {
  const session = globalSessionManager.getSessionByAgent(agent);
  if (session) {
    globalSessionManager.updateSessionActivity(session.id, metadata);
  }
}

/**
 * Cleanup inactive sessions
 */
export async function cleanupInactiveSessions(
  idleThresholdMinutes: number = 30
): Promise<number> {
  return await globalSessionManager.cleanupIdleSessions(idleThresholdMinutes);
}
