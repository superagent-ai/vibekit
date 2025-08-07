# VibeKit MCP Server

An MCP (Model Context Protocol) server for VibeKit development tools, built with [FastMCP](https://github.com/punkpeye/fastmcp).

## Features

The VibeKit MCP Server provides a streamlined set of tools for AI assistants to manage projects and development workflows:

### Available Tools

- **`projects`** - List, get, or search VibeKit projects
  - Actions: `list`, `get`, `search`
  - Supports filtering by status, tags, priority
  
- **`project_manage`** - Create, update, or delete projects
  - Actions: `create`, `update`, `delete`
  - Full project metadata management
  
- **`current_project`** - Manage the current active project
  - Actions: `get`, `set`, `clear`
  - Quick context switching between projects

## Installation

```bash
# From the workspace root
npm install

# Build the MCP server
npm run build --workspace=packages/mcp-server
```

## Usage

### Stdio Transport (Default)

Run the server using stdio transport for local development:

```bash
# From workspace root
npm run start --workspace=packages/mcp-server

# Or directly
node packages/mcp-server/dist/index.js
```

### HTTP Stream Transport

Run the server with HTTP streaming for remote access:

```bash
# Default port 8080
node packages/mcp-server/dist/index.js --transport http-stream

# Custom port
node packages/mcp-server/dist/index.js --transport http-stream --port 3000
```

## Configuration with Claude Desktop

To use this MCP server with Claude Desktop, add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Option 1: Using npx (Recommended for published package)

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

### Option 2: Local Development

```json
{
  "mcpServers": {
    "vibekit": {
      "command": "node",
      "args": ["/path/to/vibekit/packages/mcp-server/dist/index.js"],
      "env": {}
    }
  }
}
```

Replace `/path/to/vibekit` with the actual path to your VibeKit workspace.

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

## Tool Documentation

### projects

List, get, or search VibeKit projects.

**Parameters:**
- `action` (enum): 'list' (default), 'get', or 'search'
- `id` (string, optional): Project ID for 'get' action
- `query` (string, optional): Search in name/description for 'search' action
- `tags` (string[], optional): Filter by tags
- `status` (enum, optional): 'active' (default), 'archived', or 'all'
- `priority` (enum, optional): 'high', 'medium', or 'low'

**Returns:** JSON with projects array, current project ID, and total count

### project_manage

Create, update, or delete a VibeKit project.

**Parameters:**
- `action` (enum): 'create', 'update', or 'delete'
- `id` (string, optional): Project ID (required for update/delete)
- `name` (string, optional): Project name (required for create)
- `projectRoot` (string, optional): Absolute path (required for create)
- `description` (string, optional): Project description
- `setupScript` (string, optional): Setup script command
- `devScript` (string, optional): Development script command
- `cleanupScript` (string, optional): Cleanup script command
- `tags` (string[], optional): Tags for categorization
- `status` (enum, optional): 'active' or 'archived'
- `priority` (enum, optional): 'high', 'medium', or 'low'

**Returns:** JSON with success status and project data

### current_project

Manage the current active project.

**Parameters:**
- `action` (enum): 'get' (default), 'set', or 'clear'
- `id` (string, optional): Project ID or name (for 'set' action)

**Returns:** JSON with current project info and status message

## Project Data Structure

Projects managed by this MCP server have the following structure:

```typescript
interface Project {
  id: string;
  name: string;
  projectRoot: string;
  setupScript?: string;
  devScript?: string;
  cleanupScript?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  description?: string;
  status: 'active' | 'archived';
  rank?: number;
  priority?: 'high' | 'medium' | 'low';
}
```

## License

Part of the VibeKit project.