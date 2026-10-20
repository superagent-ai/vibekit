# Vibekit CLI

A CLI middleware for headless and TUI coding agents that provides logging and sandbox capabilities.

## Overview

Vibekit CLI wraps existing coding agents like Claude Code CLI, Gemini CLI, and others to provide:

- **Docker Security**: Agents run in isolated containers with no host system access
- **Logging**: Capture all agent interactions and commands
- **Safe Sandboxing**: Complete isolation with resource limits and network restrictions
- **Unified Interface**: Single CLI for multiple coding agents

## Installation

```bash
npm install -g vibekit-cli
```

Or install locally:

```bash
npm install
npm link
```

## Usage

### Basic Commands

```bash
# Run Claude with local sandbox (default, no dependencies required)
vibekit claude

# Run with different sandbox types
vibekit claude --sandbox local        # File isolation (default, fast)
vibekit claude --sandbox docker       # Container isolation (requires Docker)
vibekit claude --sandbox none         # No sandbox (dangerous!)

# Allow network access
vibekit claude --network              # Enable network access

# Pass arguments to the underlying agent  
vibekit claude --help
vibekit claude "Fix the bug in src/app.js"

# View logs
vibekit logs
vibekit logs --agent claude --lines 100

# Open analytics dashboard
vibekit dashboard                     # Start dashboard and open in browser
vibekit status                        # View dashboard status

# Sync changes from sandbox back to your project
vibekit sync

# Clean up
vibekit clean
vibekit clean --logs
vibekit clean --docker
```

### Claude web search

Fresh `vibekit claude` sessions include [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp)
for free web search and page fetching, without a Parallel account or API key.
Anonymous search uses Fast mode. Claude still asks for tool permission according
to its normal policy; VibeKit does not automatically approve the tools.

```bash
vibekit claude "Find the current Node.js release documentation"

# Disable the online search connection, including for offline use
vibekit claude --no-search
```

Set `"search": false` in `~/.vibekit/settings.json`, or set `VIBEKIT_SEARCH=off`,
to disable it across launches. The built-in configuration is passed in memory;
VibeKit does not write to your Claude configuration. Existing MCP servers,
search/tool policies, explicit MCP/settings flags and resumed sessions keep their
own configuration. Unreadable configuration, managed policies, custom Claude
configuration directories and custom sandbox profiles/images/flags also suppress
the default. Other agents keep their existing tool configuration.

Search needs network access and is subject to the service's free-tier limits.
Claude owns connection failures, tool timeouts and cancellation; VibeKit does not
switch providers after a failed search. You can still configure your own MCP
servers with Claude's normal settings or `--mcp-config`.

### Sandbox Options

**Local (Default - Fast & Simple):**
- ⚡ **Instant startup** - No dependencies required
- 📁 **File isolation** - Protects your main project files
- 💻 **Full terminal UI support** - Colors, TUI, interactive prompts  
- 🏃 **Fast execution** - No container overhead
- 🔄 **Easy sync** - Changes isolated until you decide to apply them
- ✅ **Works everywhere** - No Docker installation needed

**Docker (Maximum Security):**
- 🔒 **Complete container isolation** - Agents can't access host system
- 💻 **Full terminal UI support** - Colors, TUI, interactive prompts
- 🚫 **No host system access** - True containerization
- 📊 **Resource limits** - Configurable CPU/memory limits
- ⚙️ **Requires Docker** - Must have Docker installed

**None (Dangerous):**
- ⚡ **No overhead** - Direct execution
- ⚠️ **No protection** - Agent has full system access
- 🚨 **Only use with trusted agents**

### Logging

All agent interactions are logged to `~/.vibekit/logs/`:
- Commands executed
- Agent responses  
- Errors and debugging info
- Execution time and metadata

Enable debug logging:
```bash
VIBEKIT_DEBUG=1 vibekit claude
```

### Analytics Dashboard

Vibekit includes a built-in analytics dashboard that provides real-time insights into your coding sessions:

```bash
# Start dashboard and open in browser
vibekit dashboard

# Check dashboard status
vibekit status
```

**Dashboard Features:**
- 📊 **Session Analytics** - Track coding session duration and productivity
- 🔍 **Command History** - View all executed commands and their outcomes  
- ⚡ **Real-time Updates** - Live monitoring of agent activity
- 📈 **Performance Metrics** - Analyze agent response times and success rates
- 🎯 **Project Insights** - Understand file modification patterns

The dashboard runs on `http://localhost:3001` by default and provides a clean, modern interface for monitoring your AI-assisted coding workflows.

## Configuration

Config file location: `~/.vibekit/config.json`

```json
{
  "agents": {
    "claude": {
      "command": "claude", 
      "args": [],
      "env": {},
      "sandbox": {
        "enabled": true,
        "autoBackup": true,
        "autoSync": true
      }
    }
  },
  "logging": {
    "level": "info",
    "debug": false,
    "retention": {
      "days": 30,
      "maxFiles": 100
    }
  },
  "sandbox": {
    "defaultEnabled": true,
    "backupOnStart": true,
    "syncOnExit": true
  }
}
```

## Supported Agents

- **Claude Code CLI**: `vibekit claude`
- **Gemini CLI**: `vibekit gemini` 
- More agents can be easily added

## Development

```bash
git clone <repo>
cd vibekit-cli
npm install
npm link
```

## Architecture

```
vibekit-cli/
├── src/
│   ├── cli.js              # Main CLI entry point
│   ├── agents/             # Agent wrapper modules
│   │   ├── base.js         # Base agent class
│   │   ├── claude.js       # Claude Code CLI wrapper
│   │   └── gemini.js       # Gemini CLI wrapper
│   ├── logging/            # Logging system
│   ├── sandbox/            # Sandbox functionality
│   └── config/             # Configuration management
└── bin/vibekit             # Executable
```
