# @vibe-kit/mcp-server

A Model Context Protocol (MCP) server that provides AI assistants with powerful tools for managing VibeKit development workflows and projects. Built with [FastMCP](https://github.com/punkpeye/fastmcp) for high performance and reliability.

## Overview

The VibeKit MCP Server enables AI assistants like Claude, GPT-4, and others to interact with your development projects through a standardized protocol. It provides seamless access to project management capabilities, making it easy to integrate AI assistance into your development workflow.

## Features

- 🚀 **High Performance**: Built with FastMCP for optimal performance
- 🔧 **Project Management**: Complete CRUD operations for development projects
- 🔍 **Advanced Search**: Intelligent project discovery and filtering
- 🎯 **Type-Safe**: Full TypeScript support with Zod validation
- 📡 **Multiple Transports**: Support for stdio and HTTP streaming
- 🔒 **Secure**: Input validation and error handling
- 📊 **Comprehensive Logging**: Structured logging with @vibe-kit/logger
- 🏗️ **Zero Dependencies**: Minimal and efficient implementation

## Available Tools

### `projects`
List, get, or search VibeKit projects with powerful filtering capabilities.

**Actions:**
- `list` - List all projects (default)
- `get` - Get a specific project by ID
- `search` - Search projects with advanced filters

**Capabilities:**
- Filter by status (active/archived/all)
- Search by name and description
- Filter by tags and priority levels
- Full project metadata access

### `project_manage`
Complete project lifecycle management with create, update, and delete operations.

**Actions:**
- `create` - Create new projects with full metadata
- `update` - Update existing project properties
- `delete` - Safely remove projects

**Features:**
- Full project metadata management
- Validation of project data
- Safe deletion with confirmation
- Update tracking and timestamps

## Installation

### Via npm (Recommended)

```bash
npm install -g @vibe-kit/mcp-server
```

### From Source

```bash
# Clone the repository
git clone https://github.com/superagent-ai/vibekit.git
cd vibekit

# Install dependencies
npm install

# Build the MCP server
npm run build --workspace=packages/mcp-server
```

## Usage

### Quick Start

```bash
# Run with default stdio transport
vibekit-mcp

# Run with HTTP streaming (for remote access)
vibekit-mcp --transport http-stream --port 8080
```

### Transport Options

#### Stdio Transport (Default)
Best for local development and direct integration with AI clients:

```bash
# Using global installation
vibekit-mcp

# From source
npm run start --workspace=packages/mcp-server

# Direct execution
node packages/mcp-server/dist/index.js
```

#### HTTP Stream Transport
Ideal for remote access and web integrations:

```bash
# Default port 8080
vibekit-mcp --transport http-stream

# Custom port
vibekit-mcp --transport http-stream --port 3000

# Access endpoint: http://localhost:3000/mcp
```

## Integration with AI Clients

### Claude Desktop Configuration

Add the VibeKit MCP server to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Using Global Installation (Recommended)

```json
{
  "mcpServers": {
    "vibekit": {
      "command": "vibekit-mcp",
      "args": [],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Using npx

```json
{
  "mcpServers": {
    "vibekit": {
      "command": "npx",
      "args": ["-y", "@vibe-kit/mcp-server"],
      "env": {}
    }
  }
}
```

#### Local Development

```json
{
  "mcpServers": {
    "vibekit": {
      "command": "node",
      "args": ["/path/to/vibekit/packages/mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### Other MCP Clients

The server works with any MCP-compatible client. Configure your client to connect to:
- **Stdio**: Direct process execution
- **HTTP Stream**: `http://localhost:8080/mcp` (or your configured port)

## Testing with MCP CLI

You can test the server using the MCP CLI:

```bash
# Install MCP CLI globally
npm install -g @wong2/mcp-cli

# Test the server
npx @wong2/mcp-cli npx tsx packages/mcp-server/src/index.ts
```

## Development

### Build

```bash
npm run build --workspace=packages/mcp-server
```

### Watch Mode

```bash
npm run dev --workspace=packages/mcp-server
```

### Type Checking

```bash
npm run type-check --workspace=packages/mcp-server
```

## API Reference

### Tool: `projects`

Comprehensive project discovery and listing with advanced filtering capabilities.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `action` | `'list' \| 'get' \| 'search'` | No | `'list'` | Operation to perform |
| `id` | `string` | No | - | Project ID (required for `get` action) |
| `query` | `string` | No | - | Search query for name/description (for `search` action) |
| `tags` | `string[]` | No | - | Filter by project tags |
| `status` | `'active' \| 'archived' \| 'all'` | No | `'active'` | Project status filter |
| `priority` | `'high' \| 'medium' \| 'low'` | No | - | Filter by priority level |

#### Examples

**List all active projects:**
```json
{
  "action": "list"
}
```

**Get specific project by ID:**
```json
{
  "action": "get",
  "id": "abc123"
}
```

**Search projects by name and tags:**
```json
{
  "action": "search",
  "query": "react",
  "tags": ["web", "typescript"],
  "status": "all"
}
```

#### Returns

```typescript
{
  projects: Project[];
  total: number;
}
```

Or for single project (get action):
```typescript
Project | { error: string }
```

### Tool: `project_manage`

Complete project lifecycle management with full CRUD operations.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `'create' \| 'update' \| 'delete'` | Yes | Management operation |
| `id` | `string` | For update/delete | Project ID to modify or delete |
| `name` | `string` | For create | Project name (must be unique) |
| `projectRoot` | `string` | For create | Absolute path to project directory |
| `description` | `string` | No | Project description |
| `setupScript` | `string` | No | Command to set up the project |
| `devScript` | `string` | No | Command to start development mode |
| `cleanupScript` | `string` | No | Command to clean up project artifacts |
| `tags` | `string[]` | No | Tags for project categorization |
| `status` | `'active' \| 'archived'` | No | Project status |
| `priority` | `'high' \| 'medium' \| 'low'` | No | Project priority level |

#### Examples

**Create a new project:**
```json
{
  "action": "create",
  "name": "My New Project",
  "projectRoot": "/home/user/projects/my-project",
  "description": "A sample web application",
  "setupScript": "npm install",
  "devScript": "npm run dev",
  "tags": ["web", "typescript"],
  "priority": "high"
}
```

**Update project metadata:**
```json
{
  "action": "update",
  "id": "abc123",
  "description": "Updated description",
  "status": "archived"
}
```

**Delete a project:**
```json
{
  "action": "delete",
  "id": "abc123"
}
```

#### Returns

```typescript
{
  success: boolean;
  project?: Project;
  message?: string;
  error?: string;
}
```

## Data Structures

### Project Interface

```typescript
interface Project {
  id: string;                    // Unique project identifier
  name: string;                  // Human-readable project name
  projectRoot: string;           // Absolute path to project directory
  setupScript?: string;          // Command to initialize project
  devScript?: string;            // Command to start development
  cleanupScript?: string;        // Command to clean artifacts
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
  tags?: string[];              // Categorization tags
  description?: string;         // Project description
  status: 'active' | 'archived'; // Project status
  priority?: 'high' | 'medium' | 'low'; // Priority level
  manualTasks?: ManualTask[];   // Associated manual tasks
}
```

### Manual Task Interface

```typescript
interface ManualTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  updatedAt: string;
  subtasks?: ManualSubtask[];
}
```

## Error Handling

The server implements comprehensive error handling:

### Validation Errors
- Missing required parameters
- Invalid parameter types
- Invalid enum values

### Runtime Errors
- Project not found
- File system access errors
- JSON parsing errors

### Error Response Format

```typescript
{
  success: false;
  error: string;      // Human-readable error message
}
```

## Logging

The server uses structured logging via `@vibe-kit/logger`:

```javascript
// Log levels: error, warn, info, debug
log.info('Server started', { port, transport: 'stdio' });
log.error('Tool execution failed', { tool: 'projects', error });
```

## Performance

- **Fast Startup**: Minimal initialization overhead
- **Efficient Operations**: Optimized project queries
- **Memory Management**: Automatic cleanup of resources
- **Concurrent Safety**: Thread-safe operations

## Security

- **Input Validation**: All parameters validated with Zod schemas
- **Path Security**: Absolute path requirements prevent traversal attacks
- **Error Sanitization**: Sensitive information filtered from error messages
- **Graceful Degradation**: Robust error handling prevents crashes

## Monitoring

### Health Checks

The server provides built-in health monitoring:

```bash
# Check if server is running (stdio)
echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | vibekit-mcp

# Check HTTP endpoint
curl http://localhost:8080/mcp/health
```

### Metrics

- Tool execution count
- Error rates by tool
- Average response times
- Active connections (HTTP mode)

## Compatibility

### MCP Version
- **Supported**: MCP Protocol v1.0+
- **SDK**: Model Context Protocol SDK v1.17.1+

### Node.js Versions
- **Minimum**: Node.js 18.0.0
- **Recommended**: Node.js 20.x LTS
- **Tested**: Node.js 18.x, 20.x, 21.x

### Operating Systems
- **Linux**: Full support
- **macOS**: Full support  
- **Windows**: Full support

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build --workspace=packages/mcp-server

# Run tests
npm run test --workspace=packages/mcp-server
```

### Development Mode

```bash
# Watch mode with auto-reload
npm run dev --workspace=packages/mcp-server

# Type checking
npm run type-check --workspace=packages/mcp-server
```

### Testing

```bash
# Unit tests
npm test

# Integration tests with coverage
npm run test:coverage

# Test with actual MCP client
npx @wong2/mcp-cli node dist/index.js
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Development Guidelines

- Follow TypeScript strict mode
- Add comprehensive error handling
- Include unit tests for new tools
- Update documentation for API changes
- Use conventional commit messages

## Changelog

### 0.0.1
- Initial release with project management tools
- FastMCP integration
- Stdio and HTTP stream transport support
- Comprehensive error handling and validation

## License

MIT - Part of the VibeKit project

## Support

- **Issues**: [GitHub Issues](https://github.com/superagent-ai/vibekit/issues)
- **Documentation**: [VibeKit Docs](https://docs.vibekit.sh)
- **Community**: [Discord](https://discord.gg/vibekit)