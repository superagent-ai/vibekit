// Type definitions for the chat interface component library

export interface ChatInterfaceConfig {
  // Feature toggles
  features: {
    repositorySelector: boolean;
    branchSelector: boolean;
    modeSelector: boolean;
    modelSelector: boolean;
    environmentSelector: boolean;
    desktopToggle: boolean;
    commandPalette: boolean;
  };
  
  // Component behaviors
  behaviors: {
    allowRepositoryChange: boolean;
    allowBranchChange: boolean;
    allowModeChange: boolean;
    allowModelChange: boolean;
    allowEnvironmentChange: boolean;
    showGitHubStatus: boolean;
    autoResizeInput: boolean;
  };
  
  // UI customization
  ui: {
    placeholder?: string;
    submitButtonText?: string;
    submitButtonIcon?: React.ReactNode;
    showAnimatedBorder?: boolean;
    compactMode?: boolean;
    minHeight?: string;
  };
}

export interface ChatInterfaceProps {
  config?: Partial<ChatInterfaceConfig>;
  onSubmit: (params: ChatSubmitParams) => void | Promise<void>;
  isLoading?: boolean;
  className?: string;
  defaultMode?: "ask" | "code";
  defaultRepository?: {
    organization?: string;
    repository?: string;
    branch?: string;
  };
  onRepositoryChange?: (repository: {
    organization?: string;
    repository?: string;
    branch?: string;
  }) => void;
}

export interface ChatSubmitParams {
  message: string;
  mode: "ask" | "code";
  repository?: {
    organization?: string;
    repository?: string;
    branch?: string;
  };
  environment?: string;
  model?: string;
  useDesktop?: boolean;
  metadata?: Record<string, any>;
}

export interface GitHubStatusProps {
  showChangeButton?: boolean;
  compact?: boolean;
  className?: string;
  repository?: {
    organization?: string;
    repository?: string;
    branch?: string;
  };
  onRepositoryChange?: (repository: {
    organization?: string;
    repository?: string;
    branch?: string;
  }) => void;
}

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  autoResize?: boolean;
  enableCommandPalette?: boolean;
  isLoading?: boolean;
  className?: string;
  minHeight?: string;
}

export interface ChatControlsProps {
  mode: "ask" | "code";
  onModeChange?: (mode: "ask" | "code") => void;
  model?: string;
  onModelChange?: (model: string) => void;
  environment?: string;
  onEnvironmentChange?: (environment: string) => void;
  showModeSelector?: boolean;
  showModelSelector?: boolean;
  showEnvironmentSelector?: boolean;
  isLoading?: boolean;
}