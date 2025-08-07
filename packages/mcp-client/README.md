# @vibe-kit/mcp-client

MCP (Model Context Protocol) client for managing and connecting to MCP servers in VibeKit.

## Features

- 🔌 Connect to multiple MCP servers simultaneously
- 🛠️ Discover and invoke tools from connected servers
- 📦 Support for stdio and HTTP/SSE transports
- 🔄 Automatic reconnection with exponential backoff
- 💾 Persistent server configuration storage
- 🎛️ Server health monitoring and status tracking
- 🔍 Tool and resource discovery
- ⚡ Connection pooling for optimal performance

## Installation

```bash
npm install @vibe-kit/mcp-client
```

## Usage

```typescript
import { MCPClientManager } from '@vibe-kit/mcp-client';

// Initialize the client manager
const manager = new MCPClientManager({
  configPath: '~/.vibekit/mcp-servers.json'
});

// Add a new server
await manager.addServer({
  name: 'My MCP Server',
  transport: 'stdio',
  config: {
    command: 'node',
    args: ['./my-mcp-server.js']
  }
});

// Connect to a server
await manager.connect('server-id');

// Discover available tools
const tools = await manager.getTools('server-id');

// Execute a tool
const result = await manager.executeTool('server-id', 'tool-name', {
  // tool parameters
});

// Disconnect from a server
await manager.disconnect('server-id');
```

## Server Configuration

Servers can be configured with different transport mechanisms:

### Stdio Transport
```typescript
{
  name: 'Stdio Server',
  transport: 'stdio',
  config: {
    command: 'python',
    args: ['mcp-server.py'],
    env: {
      API_KEY: 'your-api-key'
    }
  }
}
```

### HTTP/SSE Transport
```typescript
{
  name: 'HTTP Server',
  transport: 'sse',
  config: {
    url: 'http://localhost:3000/mcp'
  }
}
```

## API Reference

### MCPClientManager

The main class for managing MCP server connections.

#### Methods

- `addServer(config)` - Add a new server configuration
- `removeServer(id)` - Remove a server
- `updateServer(id, config)` - Update server configuration
- `connect(id)` - Connect to a server
- `disconnect(id)` - Disconnect from a server
- `getServers()` - List all configured servers
- `getServer(id)` - Get a specific server
- `getTools(serverId)` - Get available tools from a server
- `getResources(serverId)` - Get available resources from a server
- `executeTool(serverId, toolName, params)` - Execute a tool

## Events

The client manager emits events for monitoring:

```typescript
manager.on('server:connected', (serverId) => {
  console.log(`Server ${serverId} connected`);
});

manager.on('server:disconnected', (serverId) => {
  console.log(`Server ${serverId} disconnected`);
});

manager.on('server:error', (serverId, error) => {
  console.error(`Server ${serverId} error:`, error);
});
```

## License

MIT