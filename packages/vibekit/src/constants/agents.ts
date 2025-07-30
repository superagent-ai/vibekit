/**
 * Agent type definitions and configurations
 * Central source of truth for all agent types across VibeKit
 */

import { AgentType } from "../types";

// Agent metadata for display purposes
export interface AgentMetadata {
  name: AgentType;
  display: string;
  description: string;
  dockerImage?: string;
  e2bTemplate?: string;
}

// Complete agent configurations
export const AGENT_CONFIGS: Record<AgentType, AgentMetadata> = {
  codex: {
    name: "codex",
    display: "Codex",
    description: "OpenAI's Codex agent",
    dockerImage: "superagentai/vibekit-codex:1.0",
    e2bTemplate: "vibekit-codex"
  },
  claude: {
    name: "claude",
    display: "Claude",
    description: "Anthropic's Claude Code agent",
    dockerImage: "superagentai/vibekit-claude:1.0",
    e2bTemplate: "vibekit-claude"
  },
  opencode: {
    name: "opencode",
    display: "OpenCode",
    description: "Open source coding agent",
    dockerImage: "superagentai/vibekit-opencode:1.0",
    e2bTemplate: "vibekit-opencode"
  },
  gemini: {
    name: "gemini",
    display: "Gemini",
    description: "Google's Gemini CLI agent",
    dockerImage: "superagentai/vibekit-gemini:1.1",
    e2bTemplate: "vibekit-gemini"
  },
  grok: {
    name: "grok",
    display: "Grok",
    description: "xAI's Grok agent with advanced reasoning",
    dockerImage: "superagentai/vibekit-grok-cli:1.0",
    e2bTemplate: "vibekit-grok"
  },
  qwen: {
    name: "qwen",
    display: "Qwen",
    description: "Alibaba's Qwen Code agent",
    dockerImage: "superagentai/vibekit-qwen:1.0",
    e2bTemplate: "vibekit-qwen"
  }
};

// Helper to get all agent types as an array
export const AGENT_TYPES: AgentType[] = Object.keys(AGENT_CONFIGS) as AgentType[];

// Helper function to get Docker image for an agent type
export function getDockerImageForAgent(agentType?: AgentType): string {
  if (!agentType || !AGENT_CONFIGS[agentType]) {
    return "ubuntu:22.04"; // Default fallback
  }
  return AGENT_CONFIGS[agentType].dockerImage || "ubuntu:22.04";
}

// Helper function to get E2B template for an agent type
export function getE2BTemplateForAgent(agentType?: AgentType): string {
  if (!agentType || !AGENT_CONFIGS[agentType]) {
    return "vibekit-codex"; // Default fallback
  }
  return AGENT_CONFIGS[agentType].e2bTemplate || "vibekit-codex";
}