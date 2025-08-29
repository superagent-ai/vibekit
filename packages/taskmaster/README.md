# @vibe-kit/taskmaster

A powerful, self-contained task management system with Kanban board functionality designed for project-based workflows. Features real-time updates, drag-and-drop interfaces, and seamless integration with any framework.

## Features

- 📋 **Complete Task Management**: Create, update, delete tasks with full metadata
- 🎯 **Kanban Board**: Visual task management with drag-and-drop support
- 🔄 **Real-time Updates**: Server-Sent Events (SSE) for live synchronization
- 📁 **File-based Storage**: Simple JSON-based storage in `.taskmaster` folders
- 🔌 **Framework Agnostic**: Works with Next.js, Express, Fastify, and more
- 🎨 **Drag & Drop**: Built-in support with @dnd-kit integration
- 🏷️ **Tag-based Organization**: Organize tasks by tags/branches
- ⚡ **Zero Config**: Works out of the box with sensible defaults
- 🔒 **Type Safe**: Full TypeScript support with comprehensive types
- 📊 **Rich Metadata**: Support for priorities, dependencies, subtasks

## Installation

```bash
npm install @vibe-kit/taskmaster
```

## Quick Start

### Installation

```bash
npm install @vibe-kit/taskmaster
```

### Basic Usage

```typescript
import { Taskmaster } from '@vibe-kit/taskmaster';

// Create a provider for your project
const provider = Taskmaster.createProvider({
  projectRoot: '/path/to/your/project',
  tasksPath: '.taskmaster/tasks/tasks.json' // optional, this is default
});

// Get all tasks
const tasks = await provider.getTasks();

// Update a task status
await provider.updateTask({
  taskId: 1,
  status: 'in-progress',
  tag: 'master'
});

// Watch for real-time changes
const unwatch = provider.watchTasks((event) => {
  console.log('Tasks updated:', event);
});
```

### Project Structure

Taskmaster creates a simple folder structure in your project:

```
your-project/
└── .taskmaster/
    └── tasks/
        └── tasks.json    # Task storage file
```

### API Routes (Next.js Example)

The package includes ready-to-use API handlers:

```typescript
// app/api/tasks/route.ts
import { Taskmaster } from '@vibe-kit/taskmaster';

export async function GET(request: Request) {
  const project = { id: '123', projectRoot: '/path/to/project' };
  return Taskmaster.api.handleGetTasks(project);
}

export async function POST(request: Request) {
  const project = { id: '123', projectRoot: '/path/to/project' };
  const body = await request.json();
  return Taskmaster.api.handleUpdateTask(project, body);
}
```

### Real-time Updates with SSE

Enable live task synchronization across multiple clients:

```typescript
// app/api/tasks/watch/route.ts
import { Taskmaster } from '@vibe-kit/taskmaster';

export async function GET(request: Request) {
  const project = { id: '123', projectRoot: '/path/to/project' };
  return Taskmaster.api.handleWatchTasks(project);
}
```

**Client-side usage:**
```typescript
const eventSource = new EventSource('/api/tasks/watch');
eventSource.onmessage = (event) => {
  const taskUpdate = JSON.parse(event.data);
  // Update your UI with the latest task changes
};
```

## API Reference

### Core Components

#### TaskmasterProvider

The main provider class for managing tasks in a project.

```typescript
import { TaskmasterProvider } from '@vibe-kit/taskmaster';

const provider = new TaskmasterProvider({
  projectRoot: '/path/to/project',
  tasksPath: '.taskmaster/tasks/tasks.json' // optional
});
```

**Methods:**

- `getTasks(): Promise<TasksData | TaggedTasks>` - Retrieve all tasks
- `updateTask(update: TaskUpdate): Promise<void>` - Update a task
- `watchTasks(callback: (event: TaskChangeEvent) => void): () => void` - Watch for changes
- `getTasksPath(): string` - Get the full path to tasks file

### API Handlers

Ready-to-use handlers for web frameworks:

#### `handleGetTasks(project: TaskmasterProject): Promise<Response>`

Retrieve tasks for a project.

```typescript
export async function GET(request: Request) {
  const project = { id: 'project-123', projectRoot: '/path/to/project' };
  return Taskmaster.api.handleGetTasks(project);
}
```

#### `handleUpdateTask(project: TaskmasterProject, body: any): Promise<Response>`

Update a task with new data.

```typescript
export async function POST(request: Request) {
  const project = { id: 'project-123', projectRoot: '/path/to/project' };
  const body = await request.json();
  return Taskmaster.api.handleUpdateTask(project, body);
}
```

#### `handleWatchTasks(project: TaskmasterProject): Promise<Response>`

Create an SSE stream for real-time task updates.

```typescript
export async function GET(request: Request) {
  const project = { id: 'project-123', projectRoot: '/path/to/project' };
  return Taskmaster.api.handleWatchTasks(project);
}
```

## Data Structures

### Task Interface

```typescript
interface Task {
  id: number;
  title: string;
  description: string;
  details: string;
  testStrategy: string;
  priority: TaskPriority;
  dependencies: number[];
  status: TaskStatus;
  subtasks: Subtask[];
}
```

### Subtask Interface

```typescript
interface Subtask {
  id: number;
  title: string;
  description: string;
  dependencies: number[];
  details: string;
  status: TaskStatus;
  testStrategy: string;
}
```

### Task Statuses

| Status | Description |
|--------|-------------|
| `pending` | Task not yet started |
| `in-progress` | Currently being worked on |
| `review` | Ready for code review |
| `done` | Task completed |
| `deferred` | Temporarily postponed |
| `cancelled` | Task cancelled |

### Task Priorities

| Priority | Description |
|----------|-------------|
| `high` | Critical/urgent tasks |
| `medium` | Standard priority |
| `low` | Nice-to-have features |

### Task File Structure

Tasks are organized by tags (like Git branches) in `.taskmaster/tasks/tasks.json`:

```json
{
  "master": {
    "tasks": [
      {
        "id": 1,
        "title": "Implement user authentication",
        "description": "Add login/logout functionality",
        "details": "Use JWT tokens for session management",
        "testStrategy": "Unit tests for auth middleware",
        "priority": "high",
        "dependencies": [],
        "status": "in-progress",
        "subtasks": [
          {
            "id": 1,
            "title": "Create login form",
            "description": "React component for user login",
            "dependencies": [],
            "details": "Include form validation",
            "status": "done",
            "testStrategy": "React Testing Library tests"
          }
        ]
      }
    ],
    "metadata": {
      "created": "2025-01-01T00:00:00.000Z",
      "updated": "2025-01-01T12:30:00.000Z",
      "description": "Main development branch tasks"
    }
  },
  "feature/user-dashboard": {
    "tasks": [
      {
        "id": 2,
        "title": "Build user dashboard",
        "description": "Create personalized dashboard",
        "details": "Include widgets for user stats",
        "testStrategy": "E2E tests for dashboard flow",
        "priority": "medium",
        "dependencies": [1],
        "status": "pending",
        "subtasks": []
      }
    ],
    "metadata": {
      "created": "2025-01-02T00:00:00.000Z",
      "updated": "2025-01-02T00:00:00.000Z",
      "description": "User dashboard feature tasks"
    }
  }
}
```

## Advanced Features

### Drag & Drop Kanban Board

Taskmaster includes built-in support for drag-and-drop Kanban boards using @dnd-kit:

```typescript
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

// The package provides utilities for drag-and-drop functionality
// Components can be built using the provider's task data
```

### Task Dependencies

Tasks can depend on other tasks, creating a dependency graph:

```typescript
await provider.updateTask({
  taskId: 2,
  dependencies: [1], // Task 2 depends on Task 1
  tag: 'master'
});
```

### File Watching

Automatic file system watching for external task file changes:

```typescript
const provider = Taskmaster.createProvider({
  projectRoot: '/path/to/project'
});

// Watch automatically starts when you call watchTasks
const unwatch = provider.watchTasks((event) => {
  switch (event.type) {
    case 'tasks-updated':
      console.log('Tasks file was modified');
      break;
    case 'file-created':
      console.log('Tasks file was created');
      break;
    case 'file-deleted':
      console.log('Tasks file was deleted');
      break;
  }
});

// Stop watching when done
unwatch();
```

### SSE Manager

Built-in Server-Sent Events management for real-time updates:

```typescript
import { SSEManager } from '@vibe-kit/taskmaster';

const sseManager = new SSEManager();

// Send updates to all connected clients
sseManager.broadcast('tasks-updated', {
  projectId: 'project-123',
  timestamp: new Date()
});
```

## Framework Integration Examples

### Next.js App Router

Complete integration with Next.js 13+ App Router:

```typescript
// app/api/projects/[projectId]/tasks/route.ts
import { Taskmaster } from '@vibe-kit/taskmaster';
import { getProject } from '@/lib/projects';

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const project = await getProject(params.projectId);
  return Taskmaster.api.handleGetTasks(project);
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const project = await getProject(params.projectId);
  const body = await request.json();
  return Taskmaster.api.handleUpdateTask(project, body);
}
```

```typescript
// app/api/projects/[projectId]/tasks/watch/route.ts
export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const project = await getProject(params.projectId);
  return Taskmaster.api.handleWatchTasks(project);
}
```

### Express.js

```typescript
import express from 'express';
import { Taskmaster } from '@vibe-kit/taskmaster';

const app = express();
app.use(express.json());

// Get tasks
app.get('/api/projects/:projectId/tasks', async (req, res) => {
  const project = await getProject(req.params.projectId);
  const response = await Taskmaster.api.handleGetTasks(project);
  const data = await response.json();
  res.json(data);
});

// Update task
app.post('/api/projects/:projectId/tasks', async (req, res) => {
  const project = await getProject(req.params.projectId);
  const response = await Taskmaster.api.handleUpdateTask(project, req.body);
  const data = await response.json();
  res.json(data);
});

// SSE endpoint
app.get('/api/projects/:projectId/tasks/watch', async (req, res) => {
  const project = await getProject(req.params.projectId);
  const response = await Taskmaster.api.handleWatchTasks(project);
  
  // Pipe the SSE stream
  response.body?.pipeTo(
    new WritableStream({
      write(chunk) {
        res.write(chunk);
      }
    })
  );
});
```

### Fastify

```typescript
import fastify from 'fastify';
import { Taskmaster } from '@vibe-kit/taskmaster';

const app = fastify();

app.get('/api/projects/:projectId/tasks', async (request, reply) => {
  const project = await getProject(request.params.projectId);
  const response = await Taskmaster.api.handleGetTasks(project);
  return response.json();
});

app.post('/api/projects/:projectId/tasks', async (request, reply) => {
  const project = await getProject(request.params.projectId);
  const response = await Taskmaster.api.handleUpdateTask(project, request.body);
  return response.json();
});
```

## Architecture

The taskmaster package follows a modular, self-contained design:

```
@vibe-kit/taskmaster/
├── src/
│   ├── providers/          # Core task provider logic
│   │   └── taskmaster.ts   # Main TaskmasterProvider class
│   ├── api/               # API route handlers
│   │   ├── handlers.ts    # Helper functions
│   │   └── routes.ts      # Route implementations
│   ├── components/        # Optional UI components
│   │   └── index.ts       # Component exports
│   ├── types/            # TypeScript definitions
│   │   └── index.ts      # All interfaces and types
│   ├── utils/            # Utility functions
│   │   └── sse.ts        # SSE management
│   └── index.ts          # Main exports
├── test/                 # Comprehensive test suite
└── dist/                # Compiled output
```

### Design Principles

- **Self-contained**: No external dependencies on UI frameworks
- **Framework agnostic**: Works with any web framework
- **Type-safe**: Full TypeScript support throughout
- **Event-driven**: Real-time updates via events and SSE
- **File-based**: Simple JSON storage, no database required
- **Modular**: Use only the parts you need

## Error Handling

Taskmaster provides comprehensive error handling for common scenarios:

```typescript
try {
  const tasks = await provider.getTasks();
} catch (error) {
  if (error.message.includes('No tasks file found')) {
    // Initialize taskmaster for this project
    console.log('Taskmaster not initialized for this project');
  } else {
    // Handle other errors
    console.error('Error loading tasks:', error);
  }
}
```

### Common Error Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| `No tasks file found` | Project not initialized | Create `.taskmaster/tasks/tasks.json` |
| `Invalid JSON` | Corrupted task file | Restore from backup or recreate |
| `Permission denied` | File access issues | Check file/directory permissions |
| `Task not found` | Invalid task ID | Verify task exists before updating |

## Performance Considerations

- **File Watching**: Uses efficient file system watchers (chokidar)
- **Memory Usage**: Tasks loaded on-demand, not kept in memory
- **Concurrent Access**: Safe for multiple simultaneous operations
- **Large Task Lists**: Efficient JSON parsing and serialization

## Security

- **Path Traversal**: All paths are validated and normalized
- **Input Validation**: Task data is validated before processing
- **File Permissions**: Respects system file permissions
- **Safe JSON**: Uses safe JSON parsing to prevent code injection

## Testing

Comprehensive test suite included:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Categories

- **Unit Tests**: Core provider functionality
- **Integration Tests**: API handlers and SSE
- **File System Tests**: Task file operations
- **Error Handling Tests**: Edge cases and failures

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Type Checking

```bash
npm run type-check
```

## Changelog

### 0.0.1
- Initial release with core task management
- Drag & drop support with @dnd-kit
- Server-Sent Events for real-time updates
- Framework-agnostic API handlers
- Comprehensive TypeScript support

## Contributing

We welcome contributions! When contributing to taskmaster:

### Guidelines

1. **Keep it self-contained**: Avoid external UI framework dependencies
2. **Maintain type safety**: All code must have proper TypeScript types
3. **Test thoroughly**: Add tests for new functionality
4. **Document changes**: Update README and code comments
5. **Follow conventions**: Use existing code style and patterns

### Development Process

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the full test suite
5. Update documentation
6. Submit a pull request

### Testing Your Changes

```bash
# Install dependencies
npm install

# Run type checking
npm run type-check

# Run all tests
npm test

# Test with coverage
npm run test:coverage
```

## Dependencies

### Production Dependencies

- `@dnd-kit/core`: ^6.3.1 - Drag and drop functionality
- `@dnd-kit/sortable`: ^10.0.0 - Sortable drag and drop
- `@dnd-kit/utilities`: ^3.2.2 - Drag and drop utilities
- `@vibe-kit/logger`: ^0.0.1 - Structured logging
- `chokidar`: ^3.5.3 - Efficient file watching
- `eventemitter3`: ^5.0.1 - Event handling

### Peer Dependencies

- `@vibe-kit/projects`: ^0.0.1 - Project management integration

## Related Packages

- [`@vibe-kit/projects`](../projects/README.md): Project management system
- [`@vibe-kit/logger`](../logger/README.md): Structured logging utilities
- [`@vibe-kit/ai-chat`](../ai-chat/README.md): AI chat integration

## Support

- **Issues**: [GitHub Issues](https://github.com/superagent-ai/vibekit/issues)
- **Documentation**: [VibeKit Docs](https://docs.vibekit.sh)
- **Community**: [Discord](https://discord.gg/vibekit)

## License

MIT - Part of the VibeKit project