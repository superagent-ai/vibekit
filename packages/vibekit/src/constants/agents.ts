// Agent type constants
export const AGENT_TYPES = {
  CLAUDE: 'claude',
  CODEX: 'codex', 
  GEMINI: 'gemini',
  GROK: 'grok',
  OPENCODE: 'opencode',
} as const;

export type AgentType = typeof AGENT_TYPES[keyof typeof AGENT_TYPES];

// Agent list for iteration
export const AGENT_LIST: AgentType[] = [
  AGENT_TYPES.CLAUDE,
  AGENT_TYPES.CODEX,
  AGENT_TYPES.GEMINI,
  AGENT_TYPES.GROK,
  AGENT_TYPES.OPENCODE,
];

// Agent configurations with display names and descriptions
export const AGENT_TEMPLATES = [
  {
    name: AGENT_TYPES.CLAUDE,
    display: "Claude",
    message: "Claude - Anthropic's Claude Code agent",
  },
  {
    name: AGENT_TYPES.CODEX,
    display: "Codex",
    message: "Codex - OpenAI's Codex agent",
  },
  {
    name: AGENT_TYPES.GEMINI,
    display: "Gemini",
    message: "Gemini - Google's Gemini CLI agent",
  },
  {
    name: AGENT_TYPES.GROK,
    display: "Grok",
    message: "Grok - xAI's Grok agent",
  },
  {
    name: AGENT_TYPES.OPENCODE,
    display: "OpenCode",
    message: "OpenCode - Open source coding agent",
  },
];

// Agent display names mapping
export const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  [AGENT_TYPES.CLAUDE]: 'Claude',
  [AGENT_TYPES.CODEX]: 'Codex',
  [AGENT_TYPES.GEMINI]: 'Gemini',
  [AGENT_TYPES.GROK]: 'Grok',
  [AGENT_TYPES.OPENCODE]: 'OpenCode',
};

// Agent descriptions mapping
export const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  [AGENT_TYPES.CLAUDE]: "Anthropic's Claude Code agent",
  [AGENT_TYPES.CODEX]: "OpenAI's Codex agent",
  [AGENT_TYPES.GEMINI]: "Google's Gemini CLI agent",
  [AGENT_TYPES.GROK]: "xAI's Grok agent",
  [AGENT_TYPES.OPENCODE]: "Open source coding agent",
};

// Agent provider mapping
export const AGENT_PROVIDERS: Record<AgentType, string> = {
  [AGENT_TYPES.CLAUDE]: 'anthropic',
  [AGENT_TYPES.CODEX]: 'openai',
  [AGENT_TYPES.GEMINI]: 'google',
  [AGENT_TYPES.GROK]: 'xai',
  [AGENT_TYPES.OPENCODE]: 'opensource',
};

// Agent capabilities
export const AGENT_CAPABILITIES: Record<AgentType, string[]> = {
  [AGENT_TYPES.CLAUDE]: ['code', 'chat', 'analysis', 'documentation'],
  [AGENT_TYPES.CODEX]: ['code', 'completion', 'refactoring'],
  [AGENT_TYPES.GEMINI]: ['code', 'chat', 'multimodal'],
  [AGENT_TYPES.GROK]: ['code', 'chat', 'analysis'],
  [AGENT_TYPES.OPENCODE]: ['code', 'open-source', 'customizable'],
};