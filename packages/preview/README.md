# @vibe-kit/preview

Dev server preview system for VibeKit projects. Provides intelligent framework detection, process management, and port handling for local development servers.

## Features

- 🚀 **Automatic Framework Detection** - Detects Next.js, React, Vue, Express, Python, and static projects
- 🔧 **Process Management** - Robust dev server lifecycle management with proper cleanup
- 🔒 **Cross-Session Persistence** - Lock files ensure servers persist across browser sessions
- 🌐 **Port Management** - Intelligent port allocation and conflict resolution
- 📝 **Comprehensive Logging** - Structured logs for debugging and monitoring
- ⚡ **Resource Optimization** - Automatic cleanup of idle servers

## Installation

```bash
npm install @vibe-kit/preview
```

## Usage

### Basic Usage

```typescript
import { PreviewService } from '@vibe-kit/preview';

const preview = new PreviewService();

// Start a dev server
const instance = await preview.startServer('project-id', '/path/to/project');
console.log(`Server running at ${instance.previewUrl}`);

// Get server status
const status = await preview.getServerStatus('project-id');

// Get server logs
const logs = preview.getLogs('project-id');

// Stop the server
await preview.stopServer('project-id');
```

### Framework Detection

```typescript
import { SimpleProjectDetector } from '@vibe-kit/preview';

const result = await SimpleProjectDetector.detectProject('/path/to/project');
console.log(`Detected: ${result.framework?.name || result.type}`);
console.log(`Dev command: ${result.devCommand}`);
console.log(`Port: ${result.port}`);
```

### Port Utilities

```typescript
import { PortUtils } from '@vibe-kit/preview';

// Check if port is available
const isAvailable = await PortUtils.isPortAvailable(3000);

// Find next available port
const port = await PortUtils.findAvailablePort(3000);

// Get framework-specific default ports
const ports = PortUtils.getFrameworkDefaultPorts('Next.js');
```

## API Reference

### PreviewService

The main service for managing preview servers.

#### Methods

- `startServer(projectId: string, projectRoot: string, customPort?: number): Promise<DevServerInstance>`
- `stopServer(projectId: string): Promise<void>`
- `getServerStatus(projectId: string): Promise<DevServerInstance | null>`
- `getServerLogs(projectId: string, limit?: number): Promise<DevServerLog[]>`
- `updateActivity(projectId: string): Promise<void>`
- `stopAllServers(): Promise<void>`

### SimpleProjectDetector

Detects project types and frameworks.

#### Methods

- `detectProject(projectRoot: string): Promise<ProjectDetectionResult>`

### Supported Frameworks

| Framework | Detection | Default Port | Dev Command |
|-----------|-----------|--------------|-------------|
| Next.js | package.json dependencies | 3000 | npm run dev |
| React (Vite) | vite in devDependencies | 5173 | npm run dev |
| Vue.js | vue in dependencies | 8080 | npm run serve/dev |
| Express.js | express in dependencies | 3000 | npm run dev/start |
| Python | .py files | 8000 | python -m http.server |
| Static | index.html | 8080 | Built-in static server |

## Architecture

### Process Management

The preview system uses a singleton `DevServerManager` that:
- Spawns child processes for dev servers
- Tracks process PIDs and states
- Handles graceful shutdown (SIGTERM → SIGKILL)
- Manages resource cleanup

### Lock Files

Lock files in `~/.vibekit/preview-locks/` ensure:
- Servers persist across browser sessions
- Proper cleanup on startup
- Prevention of duplicate servers

### Port Allocation

Smart port allocation:
- Starts from framework-specific defaults
- Tests port availability before binding
- Falls back to sequential search if needed
- Range: 8080-8129 for managed servers

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the package
npm run build

# Development mode
npm run dev
```

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Migration from Dashboard

If you're migrating from the dashboard's built-in preview system:

1. Install the package: `npm install @vibe-kit/preview`
2. Update imports:
   ```typescript
   // Before
   import { DevServerManager } from '@/lib/preview/dev-server-manager';
   
   // After
   import { PreviewService } from '@vibe-kit/preview';
   ```
3. Use PreviewService instead of DevServerManager directly
4. API routes should use the service layer for cleaner abstraction

## License

MIT