# @vibekit/local

Local sandbox provider for Vibekit using [Dagger](https://dagger.io).

## Overview

The `@vibekit/local` package enables Vibekit to run AI coding agents in isolated, containerized environments on your local machine. This provides an alternative to cloud-based sandboxes, offering faster iteration, offline development, and cost savings.

## System Requirements

### Required Dependencies
- **Docker**: Container runtime for isolation
- **Dagger**: Container orchestration engine

### Supported Platforms
- macOS (recommended)
- Linux
- Windows (WSL2)

### Minimum System Resources
- 8GB RAM (16GB recommended for multiple environments)
- 10GB free disk space
- Modern CPU with virtualization support

## Installation

The local provider is automatically available when you install Vibekit. System dependencies are installed automatically when you first use the local provider:

```bash
# Initialize with local provider
vibekit init --provider local

# Or add to existing project
vibekit local setup
```

### Manual Dependency Installation

If automatic installation fails, you can install dependencies manually:

```bash
# Install Docker (platform-specific)
# See: https://docs.docker.com/get-docker/

# Install Dagger
curl -fsSL https://dagger.io/install.sh | bash

# Verify installation
dagger version
```

## Usage

### Basic API Usage

```typescript
import { createLocalProvider } from '@vibekit/local';

// Create a local provider
const provider = createLocalProvider();

// Create a sandbox instance
const sandbox = await provider.create(
  { NODE_ENV: 'development' }, // environment variables
  'claude',                    // agent type
  '/vibe0'                     // working directory
);

// Execute commands
const result = await sandbox.commands.run('npm install');
console.log(result.stdout);

// Clean up
await sandbox.kill();
```

### Configuration

```typescript
import { createLocalProvider, LocalDaggerConfig } from '@vibekit/local';

const config: LocalDaggerConfig = {
  // Configuration options for the local provider
};

const provider = createLocalProvider(config);
```

## Architecture

The local provider consists of several key components:

- **Dagger Integration**: Low-level container orchestration
- **Environment Manager**: Lifecycle and state management
- **Container Persistence**: Workspace state across commands
- **Agent Configuration**: Support for multiple agent types
- **Resource Management**: Docker container orchestration

## Agent Support

The local provider supports all Vibekit agent types:

- **Claude**: Uses `assets/dockerfiles/Dockerfile.claude`
- **Codex**: Uses `assets/dockerfiles/Dockerfile.codex`
- **OpenCode**: Uses `assets/dockerfiles/Dockerfile.opencode`
- **Gemini**: Uses `assets/dockerfiles/Dockerfile.gemini`

Each agent type can have its own optimized container image for better performance.

## Security Considerations

Local sandboxes run in Docker containers with the following isolation:

- **File System**: Containers cannot access host files outside mounted volumes
- **Network**: Containers run in isolated Docker networks
- **Process**: Complete process isolation from host system
- **Resources**: Configurable CPU and memory limits

## Interface Compatibility

This package implements the same `SandboxProvider` interface as other Vibekit providers:

```typescript
interface SandboxProvider {
  create(envs?, agentType?, workingDirectory?): Promise<SandboxInstance>;
  resume(sandboxId: string): Promise<SandboxInstance>;
}

interface SandboxInstance {
  sandboxId: string;
  commands: SandboxCommands;
  kill(): Promise<void>;
  pause(): Promise<void>;
  getHost(port: number): Promise<string>;
}
```

This ensures you can swap between local and cloud providers seamlessly.

## Troubleshooting

### Common Issues

**Docker not running:**
```bash
# Check Docker status
docker ps

# Start Docker Desktop (macOS/Windows)
# Or start Docker daemon (Linux)
```

**Dagger not found:**
```bash
# Reinstall Dagger
curl -fsSL https://dagger.io/install.sh | bash

# Check PATH
which dagger
```

**Permission errors:**
```bash
# Add user to docker group (Linux)
sudo usermod -aG docker $USER
# Then log out and back in
```

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
export VIBEKIT_LOG_LEVEL=debug
# Your Vibekit commands here
```

## Contributing

See the main [Vibekit contribution guide](../../CONTRIBUTING.md) for general guidelines.

### Local Development

```bash
# Clone the repository
git clone https://github.com/vibekit/vibekit.git
cd vibekit

# Install dependencies
npm install

# Build the local package
cd packages/local
npm run build

# Run tests
npm test
```

## License

MIT - see [LICENSE](../../LICENSE) for details. 