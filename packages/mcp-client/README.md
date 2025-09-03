# @vibe-kit/mcp-client

A fully modular, standalone TypeScript client for the Model Context Protocol (MCP). This package provides a complete implementation for managing and connecting to MCP servers with zero hard dependencies on any specific framework.

## Features

- 🔌 **Multiple Transport Support**: Connect via stdio, SSE, or HTTP
- 🔄 **Automatic Reconnection**: Built-in retry logic with configurable attempts
- 📁 **Flexible Configuration**: Store configs anywhere with customizable paths
- 🎯 **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🚀 **Event-Driven**: Rich event system for monitoring connection states
- 🔧 **Tool Execution**: Execute MCP server tools with typed parameters
- 📊 **Resource Management**: Access and manage server resources
- 🎨 **Prompt Templates**: Work with server-provided prompt templates
- ⚡ **Queue Management**: Built-in request queuing for optimal performance
- 🔐 **Environment Isolation**: Secure environment variable handling

## Installation

```bash
npm install @vibe-kit/mcp-client
```

## Quick Start

```typescript
import { MCPClientManager } from '@vibe-kit/mcp-client';

// Create a manager instance with custom configuration
const manager = new MCPClientManager({
  configDir: '.my-app',              // Default: '.vibekit'
  configFileName: 'servers.json',    // Default: 'servers.json'
  clientName: 'my-app-client',       // Default: 'mcp-client'
  autoConnect: false,                 // Default: false
  reconnectAttempts: 3,               // Default: 3
  reconnectDelay: 1000                // Default: 1000ms
});

// Initialize the manager
await manager.initialize();

// Add a stdio-based MCP server
await manager.addServer({
  name: 'my-local-server',
  description: 'Local MCP server for development',
  transport: 'stdio',
  command: 'node',
  args: ['./my-mcp-server.js'],
  env: {
    API_KEY: process.env.API_KEY
  }
});

// Connect to the server
await manager.connect('server-id');

// List available tools
const tools = await manager.getTools('server-id');
console.log('Available tools:', tools);

// Execute a tool
const result = await manager.executeTool('server-id', 'tool-name', {
  param1: 'value1',
  param2: 123
});
```

## Configuration

### Environment Variables

You can configure the MCP client using environment variables:

```bash
# Set the configuration directory (default: .vibekit)
export MCP_CONFIG_DIR=".my-app-config"

# Set the client name for MCP protocol identification
export MCP_CLIENT_NAME="my-application"

# Override configuration path completely
export MCP_CONFIG_PATH="/custom/path/to/config.json"
```

### Programmatic Configuration

```typescript
const manager = new MCPClientManager({
  // Full path to configuration file (overrides configDir and configFileName)
  configPath: '/path/to/config.json',
  
  // Or use separate directory and filename
  configDir: '.my-app',
  configFileName: 'mcp-servers.json',
  
  // Client identification
  clientName: 'my-mcp-client',
  
  // Metadata storage key (for internal use)
  metadataKey: '_metadata',
  
  // Connection behavior
  autoConnect: false,
  reconnectAttempts: 3,
  reconnectDelay: 1000
});
```

## Server Configuration

### stdio Transport

Connect to local MCP servers running as child processes:

```typescript
await manager.addServer({
  name: 'local-python-server',
  description: 'Python-based MCP server',
  transport: 'stdio',
  command: 'python',
  args: ['-m', 'my_mcp_server'],
  env: {
    PYTHONPATH: './src',
    DEBUG: 'true'
  },
  cwd: '/path/to/server/directory'
});
```

### SSE Transport

Connect to MCP servers via Server-Sent Events:

```typescript
await manager.addServer({
  name: 'remote-sse-server',
  description: 'Remote SSE MCP server',
  transport: 'sse',
  url: 'https://api.example.com/mcp/sse',
  headers: {
    'Authorization': 'Bearer token',
    'X-API-Key': 'api-key'
  }
});
```

### HTTP Transport

Connect to MCP servers via HTTP:

```typescript
await manager.addServer({
  name: 'remote-http-server',
  description: 'Remote HTTP MCP server',
  transport: 'http',
  baseUrl: 'https://api.example.com/mcp',
  headers: {
    'Authorization': 'Bearer token'
  },
  timeout: 30000
});
```

## API Reference

### MCPClientManager

The main class for managing multiple MCP server connections.

#### Methods

##### `initialize(): Promise<void>`
Initialize the manager and load existing configurations.

##### `addServer(input: ServerCreateInput): Promise<MCPServer>`
Add a new MCP server configuration.

##### `updateServer(id: string, input: ServerUpdateInput): Promise<MCPServer>`
Update an existing server configuration.

##### `deleteServer(id: string): Promise<void>`
Delete a server configuration.

##### `getServer(id: string): MCPServer | undefined`
Get a specific server by ID.

##### `getAllServers(): MCPServer[]`
Get all configured servers.

##### `connect(serverId: string, options?: ConnectionOptions): Promise<void>`
Connect to a specific server.

##### `disconnect(serverId: string): Promise<void>`
Disconnect from a server.

##### `disconnectAll(): Promise<void>`
Disconnect from all servers.

##### `getTools(serverId: string): Promise<Tool[]>`
Get available tools from a connected server.

##### `getResources(serverId: string): Promise<Resource[]>`
Get available resources from a connected server.

##### `getPrompts(serverId: string): Promise<Prompt[]>`
Get available prompts from a connected server.

##### `executeTool(serverId: string, toolName: string, params?: any): Promise<ToolExecutionResult>`
Execute a tool on a connected server.

##### `exportConfig(): Promise<string>`
Export the current configuration as JSON.

##### `importConfig(jsonData: string, merge?: boolean): Promise<void>`
Import configuration from JSON. Set `merge` to false to replace existing config.

#### Events

The manager extends EventEmitter and emits the following events:

- `server:connected` - When a server successfully connects
- `server:disconnected` - When a server disconnects
- `server:error` - When a server encounters an error
- `server:status` - When a server's status changes

```typescript
manager.on('server:connected', (serverId) => {
  console.log(`Server ${serverId} connected`);
});

manager.on('server:error', (serverId, error) => {
  console.error(`Server ${serverId} error:`, error);
});
```

## Types

### ServerCreateInput

```typescript
interface ServerCreateInput {
  name: string;
  description?: string;
  transport: 'stdio' | 'sse' | 'http';
  
  // For stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  
  // For SSE transport
  url?: string;
  
  // For HTTP transport
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
}
```

### MCPServer

```typescript
interface MCPServer {
  id: string;
  name: string;
  description?: string;
  transport: TransportType;
  config: StdioConfig | HttpConfig;
  status: ServerStatus;
  toolCount?: number;
  resourceCount?: number;
  promptCount?: number;
  lastConnected?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Tool

```typescript
interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}
```

### ToolExecutionResult

```typescript
interface ToolExecutionResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
}
```

## Configuration Storage

By default, configurations are stored in JSON format at:
- **Config**: `~/<configDir>/<configFileName>` (default: `~/.vibekit/servers.json`)
- **Metadata**: `~/<configDir>/<configFileName>.metadata.json`

The configuration uses a clean format optimized for version control:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["./server.js"],
      "env": {
        "DEBUG": "true"
      }
    }
  }
}
```

Metadata (status, timestamps, etc.) is stored separately to keep the main config clean.

## Advanced Usage

### Custom Storage Location

```typescript
// Use a completely custom path
const manager = new MCPClientManager({
  configPath: '/var/lib/myapp/mcp-config.json'
});

// Or use custom directory and filename
const manager = new MCPClientManager({
  configDir: '.myapp',
  configFileName: 'mcp-servers.json'
});
```

### Import/Export Configuration

```typescript
// Export current configuration
const configJson = await manager.exportConfig();
fs.writeFileSync('backup.json', configJson);

// Import configuration (merge with existing)
const importData = fs.readFileSync('servers.json', 'utf-8');
await manager.importConfig(importData, true);

// Import configuration (replace existing)
await manager.importConfig(importData, false);
```

### Connection Options

```typescript
await manager.connect('server-id', {
  timeout: 5000,        // Connection timeout in ms
  retryAttempts: 3,     // Number of retry attempts
  retryDelay: 1000      // Delay between retries in ms
});
```

### Batch Operations

```typescript
// Connect to all servers
const servers = manager.getAllServers();
await Promise.all(
  servers.map(server => 
    manager.connect(server.id).catch(err => 
      console.error(`Failed to connect to ${server.name}:`, err)
    )
  )
);

// Get tools from all connected servers
const allTools = await Promise.all(
  servers
    .filter(s => s.status === 'active')
    .map(async server => ({
      server: server.name,
      tools: await manager.getTools(server.id)
    }))
);
```

## Error Handling

The client includes comprehensive error handling:

```typescript
try {
  await manager.connect('server-id');
} catch (error) {
  if (error.message.includes('not found')) {
    console.error('Server not found');
  } else if (error.message.includes('timeout')) {
    console.error('Connection timeout');
  } else {
    console.error('Connection failed:', error);
  }
}

// Monitor errors via events
manager.on('server:error', (serverId, error) => {
  console.error(`Server ${serverId} error:`, error);
  // Implement your error handling logic
});
```

## Security Considerations

1. **Environment Variables**: Be careful when passing sensitive environment variables to MCP servers
2. **Command Execution**: The stdio transport executes commands on your system - only connect to trusted servers
3. **Network Security**: Use HTTPS for SSE and HTTP transports in production
4. **Configuration Storage**: Configurations may contain sensitive data - secure the config directory appropriately

## Development

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run type-check
```

### Testing

```bash
npm test
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please use the [GitHub issues page](https://github.com/superagent-ai/vibekit/issues).