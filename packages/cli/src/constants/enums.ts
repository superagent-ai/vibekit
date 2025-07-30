// Provider enums
export enum SANDBOX_PROVIDERS {
  DAGGER = "Dagger",
  E2B = "E2B",
  DAYTONA = "Daytona",
  NORTHFLANK = "Northflank",
}

// Agent configurations with display names and descriptions
export const AGENT_TEMPLATES = [
  {
    name: "claude",
    display: "Claude",
    message: "Claude - Anthropic's Claude Code agent",
  },
  {
    name: "codex",
    display: "Codex",
    message: "Codex - OpenAI's Codex agent",
  },
  {
    name: "gemini",
    display: "Gemini",
    message: "Gemini - Google's Gemini CLI agent",
  },
  {
    name: "grok",
    display: "Grok",
    message: "Grok - xAI's Grok agent with advanced reasoning",
  },
  {
    name: "opencode",
    display: "OpenCode",
    message: "OpenCode - Open source coding agent",
  },
  {
    name: "qwen",
    display: "Qwen",
    message: "Qwen - Alibaba's Qwen Code agent",
  },
];
