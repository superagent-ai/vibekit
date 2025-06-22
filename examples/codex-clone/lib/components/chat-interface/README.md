# Chat Interface Component Library

A flexible, configurable chat interface component library for codex-clone. This library provides reusable components for building chat interfaces with different configurations based on context.

## Components

### ChatInterface
The main component that orchestrates the entire chat interface.

```tsx
import { ChatInterface } from "@/lib/components/chat-interface";

<ChatInterface
  onSubmit={handleSubmit}
  config={config}
  defaultMode="ask"
  isLoading={false}
/>
```

### ChatInput
A smart textarea component with auto-resize and command palette support.

### ChatControls
Manages mode, model, and environment selection controls.

### GitHubStatus
Displays current GitHub repository status with optional change functionality.

### ModelSelector
Dropdown for selecting AI models.

### EnvironmentSelector
Dropdown for selecting execution environments.

## Configuration

The `ChatInterface` component accepts a configuration object to customize features and behaviors:

```typescript
interface ChatInterfaceConfig {
  // Feature toggles
  features: {
    repositorySelector: boolean;    // Show/hide repository selector
    branchSelector: boolean;        // Show/hide branch selector
    modeSelector: boolean;          // Show/hide mode toggle
    modelSelector: boolean;         // Show/hide model selector
    environmentSelector: boolean;   // Show/hide environment selector
    desktopToggle: boolean;        // Show/hide desktop toggle
    commandPalette: boolean;       // Enable/disable command palette
  };
  
  // Component behaviors
  behaviors: {
    allowRepositoryChange: boolean; // Allow changing repository
    allowBranchChange: boolean;     // Allow changing branch
    allowModeChange: boolean;       // Allow changing mode
    allowModelChange: boolean;      // Allow changing model
    allowEnvironmentChange: boolean;// Allow changing environment
    showGitHubStatus: boolean;      // Show GitHub status bar
    autoResizeInput: boolean;       // Auto-resize textarea
  };
  
  // UI customization
  ui: {
    placeholder?: string;           // Input placeholder text
    submitButtonText?: string;      // Submit button text
    submitButtonIcon?: ReactNode;   // Submit button icon
    showAnimatedBorder?: boolean;   // Show animated border effect
    compactMode?: boolean;          // Use compact layout
  };
}
```

## Usage Examples

### Home Page (Full Features)
```tsx
import { ChatInterface } from "@/lib/components/chat-interface";

export function HomePage() {
  return (
    <ChatInterface
      onSubmit={handleSubmit}
      config={{
        features: {
          repositorySelector: true,
          branchSelector: true,
          modeSelector: true,
          modelSelector: true,
          environmentSelector: true,
          desktopToggle: true,
          commandPalette: true,
        },
        behaviors: {
          allowRepositoryChange: true,
          allowBranchChange: true,
          allowModeChange: true,
          allowModelChange: true,
          allowEnvironmentChange: true,
          showGitHubStatus: true,
          autoResizeInput: true,
        },
      }}
    />
  );
}
```

### Task Page (Limited Features)
```tsx
import { ChatInterface } from "@/lib/components/chat-interface";

export function TaskPage({ repository }) {
  return (
    <ChatInterface
      onSubmit={handleFollowUp}
      defaultRepository={repository}
      config={{
        features: {
          repositorySelector: false, // Can't change repo
          branchSelector: false,    // Can't change branch
          modeSelector: true,       // Can change mode
          modelSelector: true,      // Can change model
          environmentSelector: false,
          desktopToggle: false,
          commandPalette: true,
        },
        behaviors: {
          allowRepositoryChange: false,
          allowBranchChange: false,
          allowModeChange: true,
          allowModelChange: true,
          allowEnvironmentChange: false,
          showGitHubStatus: true,
          autoResizeInput: true,
        },
        ui: {
          placeholder: "Ask a follow-up question...",
          compactMode: true,
        },
      }}
    />
  );
}
```

### Settings Page (Minimal)
```tsx
import { ChatInterface } from "@/lib/components/chat-interface";

export function SettingsTestChat() {
  return (
    <ChatInterface
      onSubmit={handleTest}
      config={{
        features: {
          repositorySelector: false,
          branchSelector: false,
          modeSelector: false,
          modelSelector: true,
          environmentSelector: true,
          desktopToggle: false,
          commandPalette: false,
        },
        behaviors: {
          allowRepositoryChange: false,
          allowBranchChange: false,
          allowModeChange: false,
          allowModelChange: true,
          allowEnvironmentChange: true,
          showGitHubStatus: false,
          autoResizeInput: false,
        },
        ui: {
          placeholder: "Test your configuration...",
          showAnimatedBorder: false,
          compactMode: true,
        },
      }}
    />
  );
}
```

## State Management

The component manages its own internal state for:
- Message input value
- Selected mode (ask/code)
- Selected model
- Selected environment
- Command palette state

External state (repositories, environments) is managed through existing stores.

## Styling

All components use Tailwind CSS and follow the existing design system. The animated border effect can be toggled via configuration.

## Accessibility

- Keyboard navigation support
- ARIA labels for all interactive elements
- Focus management for command palette
- Screen reader friendly

## Future Enhancements

1. Voice input support
2. File attachment handling
3. Message history
4. Syntax highlighting in input
5. Rich text formatting
6. Emoji picker
7. Slash command customization