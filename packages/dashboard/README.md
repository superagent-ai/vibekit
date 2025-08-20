# VibeKit Dashboard

A comprehensive monitoring, analytics, and control center for VibeKit AI coding agents. Features real-time execution tracking, resource management, health monitoring, and MCP integration - all optimized for local development with production-ready capabilities.

## Quick Start

```bash
# Install and run (from packages/dashboard)
npm install
npm run dev

# Or from root directory
npm run dev:dashboard

# Dashboard runs at http://127.0.0.1:3001
```

## Core Features

### 🎯 Execution Monitoring
Real-time tracking of all AI agent executions with detailed metrics:
- **Execution History**: Complete record of every agent run in JSONL format
- **Live Activity Stream**: Server-Sent Events for real-time updates
- **Success Analytics**: Track success rates, durations, PR creation metrics
- **Task Tracking**: Links executions to projects, tasks, and subtasks

### 📊 Dashboard Interface
Web-based monitoring at `/monitoring` with:
- **Overview Cards**: Total executions, success rate, average duration, active sessions
- **Recent Executions Table**: Last 50 executions with status, agent, sandbox, duration
- **Real-time Activity Feed**: Live event stream with color-coded severity
- **System Health Panel**: Component status with visual indicators
- **Time Range Filtering**: 1h, 24h, 7d, 30d views with auto-refresh

### 🛡️ Resource Management
Automatic protection against resource exhaustion:
- **Memory Monitor**: Auto-cleanup at 75%/85%/95% thresholds
- **Disk Monitor**: Auto-cleanup of old sessions/logs at 85%/92%/97%
- **Graceful Shutdown**: Saves all state on exit, flushes logs properly
- **Session Recovery**: Restores interrupted sessions from checkpoints

### 🔌 MCP Integration
Model Context Protocol server management:
- **Server Browser**: Discover and install MCP servers at `/mcp-servers`
- **Tool Execution**: Run MCP tools directly from the dashboard
- **Configuration Management**: Store server configs in `~/.vibekit/mcp-servers.json`
- **Recommended Servers**: Curated list with one-click installation

### 📁 Project Management
Organize work with project-specific contexts:
- **Project Dashboard**: View all projects at `/projects`
- **Task Management**: Kanban board for organizing subtasks
- **Git Integration**: Track branches, commits, PRs per project
- **Chat Context**: Project-scoped AI conversations at `/projects/[id]/chat`

### 💬 AI Chat Interface
Integrated chat with AI agents:
- **Multi-Agent Support**: Claude, Gemini, Grok, OpenAI
- **Streaming Responses**: Real-time response streaming
- **Code Highlighting**: Syntax highlighting for code blocks
- **Project Context**: Maintains context within projects

## Architecture

### System Components

```
Dashboard
├── Server (server.js)           # Custom Next.js server with monitoring
├── Middleware                   # Request validation and security
├── API Routes                   # RESTful endpoints
├── Monitoring Systems           # Resource and health monitoring
│   ├── Memory Monitor           # Prevents memory exhaustion
│   ├── Disk Monitor            # Prevents disk full errors
│   ├── Health Check            # Component health tracking
│   └── Error Tracker           # Error classification and recovery
├── Session Management          # Track AI coding sessions
├── Execution History           # Complete execution records
└── Real-time Streams          # WebSocket and SSE support
```

### Data Storage

```
~/.vibekit/
├── execution-history/          # Daily JSONL execution logs
│   ├── 2025-01-20.jsonl
│   └── index.json             # Cached summaries
├── sessions/                  # Session data and checkpoints
├── mcp-servers.json          # MCP server configurations
├── settings.json             # Dashboard settings
└── analytics/                # Usage analytics
```

## API Endpoints

### Health & Monitoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Comprehensive health status |
| `/api/health-simple` | GET | Simple up/down check |
| `/api/monitoring/dashboard` | GET | Aggregated dashboard data |
| `/api/monitoring/activity` | GET | SSE activity stream |

### Execution History

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/execution-history` | GET | Query executions with filters |
| `/api/execution-history/[id]` | GET | Get specific execution |
| `/api/execution-history/statistics` | GET | Execution analytics |
| `/api/execution-history/export` | GET | Export data (JSON/CSV/JSONL) |

### Sessions & Projects

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET/POST | List/create sessions |
| `/api/sessions/[id]/stream` | GET | Real-time session stream |
| `/api/projects` | GET/POST | List/create projects |
| `/api/projects/[id]/execute-subtask` | POST | Execute AI task |

### MCP Servers

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mcp/servers` | GET/POST | List/add servers |
| `/api/mcp/servers/[id]/tools/[name]/execute` | POST | Execute MCP tool |

## Configuration

### Environment-Based Settings

The dashboard automatically adjusts based on environment:

| Environment | NODE_ENV | Behavior |
|------------|----------|----------|
| **Local** (default) | not set | Optimized for development, minimal security |
| **Development** | `development` | Verbose logging, debugging features |
| **Production** | `production` | Full security, strict limits, monitoring |

### Local Mode (Default)

Optimized for running on developer machines:

**Enabled:**
- Memory/disk monitoring with relaxed thresholds
- Long session timeouts (24 hours)
- Large request limits (50MB)
- Console error logging
- Health monitoring

**Disabled:**
- CSRF protection
- Rate limiting (not needed locally)
- External alerting
- Clustering

### Production Mode

Enable with `NODE_ENV=production npm run start`:

**Additional Features:**
- CSRF protection and security headers
- Rate limiting (30 req/min)
- Strict limits (2MB requests, 15min sessions)
- External error reporting
- Webhook/email alerts

### Environment Variables

```bash
# Core Settings
PORT=3001                      # Server port
HOST=127.0.0.1                # Bind address

# Resource Monitoring
ENABLE_MEMORY_MONITOR=true     # Memory monitoring
ENABLE_DISK_MONITOR=true       # Disk monitoring
MEMORY_CHECK_INTERVAL=120000   # Check interval (ms)

# Logging
LOG_LEVEL=info                 # debug|info|warn|error

# Production Only
SESSION_SECRET=<secret>        # Session encryption
ALLOWED_ORIGINS=<urls>         # CORS origins
```

## Production Hardening

### Memory Management
```typescript
// Automatic cleanup thresholds
Warning: 75% - Clear caches, run GC
Critical: 85% - Terminate idle sessions
Emergency: 95% - Drop all non-essential data
```

### Disk Management
```typescript
// Automatic cleanup policies
Warning: 85% - Delete logs > 7 days
Critical: 92% - Delete sessions > 3 days
Emergency: 97% - Delete all temporary files
```

### Error Recovery
- **Classification**: Automatic error categorization
- **Retry Logic**: Exponential backoff for transient failures
- **Circuit Breaker**: Prevent cascading failures
- **Checkpoints**: State restoration for interrupted operations

### Security Features
- **Input Validation**: Comprehensive request validation
- **Path Protection**: Prevent directory traversal
- **Rate Limiting**: Configurable request limits (production)
- **CSRF Protection**: Double-submit cookie pattern (production)
- **Security Headers**: XSS, clickjacking protection

## Deployment

### Development
```bash
# Standard development mode
npm run dev

# With monitoring enabled
ENABLE_MONITORING=true npm run dev
```

### Production
```bash
# Build for production
npm run build

# Run with production settings
NODE_ENV=production npm run start

# With PM2 (for actual production servers)
pm2 start server.js --name vibekit-dashboard
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci --production && npm run build
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "server.js"]
```

## Troubleshooting

### Common Issues

**Port Already in Use**
```bash
kill -9 $(lsof -ti:3001)
PORT=3002 npm run dev
```

**High Memory Usage**
- Dashboard auto-cleans at 75%
- Force restart: `pkill -f server.js && npm run dev`

**Disk Space Issues**
- Auto-cleanup at 85%
- Manual: `rm -rf ~/.vibekit/sessions/abandoned/*`

## Scripts

| Command | Description |
|---------|-----------|
| `npm run dev` | Start dashboard (local mode) |
| `npm run build` | Build for production |
| `npm run start` | Start server |
| `npm run start:production` | Start with production settings |
| `npm run type-check` | TypeScript validation |
| `npm run lint` | Run linter |

## Performance Characteristics

- **Memory**: ~200MB baseline, bounded caches
- **CPU**: < 5% idle, spikes during builds
- **Response Times**: Health check < 50ms, queries < 100ms
- **Scalability**: 5 concurrent executions, 100 active sessions

## License

MIT