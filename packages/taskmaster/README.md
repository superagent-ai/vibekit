# @vibe-kit/taskmaster

A self-contained task management system with Kanban board functionality for projects using `.taskmaster` folders.

## Features

- 📋 Task management with JSON-based storage
- 🎯 Kanban board visualization
- 🔄 Real-time updates via Server-Sent Events (SSE)
- 📦 Completely self-contained package
- 🔌 Easy integration with any framework

## Installation

```bash
npm install @vibe-kit/taskmaster
```

## Usage

### Basic Setup

The taskmaster package provides everything you need to add task management to your application:

```typescript
import { Taskmaster } from '@vibe-kit/taskmaster';

// Create a provider for a project
const provider = Taskmaster.createProvider({
  projectRoot: '/path/to/project',
  tasksPath: '.taskmaster/tasks/tasks.json' // optional, this is the default
});

// Get tasks
const tasks = await provider.getTasks();

// Update a task
await provider.updateTask({
  taskId: 1,
  status: 'done',
  tag: 'master'
});
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

### Server-Sent Events (SSE)

Watch for real-time task updates:

```typescript
// app/api/tasks/watch/route.ts
import { Taskmaster } from '@vibe-kit/taskmaster';

export async function GET(request: Request) {
  const project = { id: '123', projectRoot: '/path/to/project' };
  return Taskmaster.api.handleWatchTasks(project);
}
```

## Task File Structure

Tasks are stored in a JSON file at `.taskmaster/tasks/tasks.json`:

```json
{
  "master": {
    "tasks": [
      {
        "id": 1,
        "title": "Task Title",
        "description": "Task description",
        "details": "Detailed information",
        "testStrategy": "How to test this task",
        "priority": "high",
        "dependencies": [],
        "status": "pending",
        "subtasks": []
      }
    ],
    "metadata": {
      "created": "2025-01-01T00:00:00.000Z",
      "updated": "2025-01-01T00:00:00.000Z",
      "description": "Tag description"
    }
  }
}
```

## Task Statuses

- `pending` - Not started
- `in-progress` - Currently being worked on
- `review` - Ready for review
- `done` - Completed
- `deferred` - Postponed
- `cancelled` - Cancelled

## Task Priorities

- `high` - High priority
- `medium` - Medium priority
- `low` - Low priority

## Architecture

The taskmaster package is designed to be completely self-contained:

```
@vibe-kit/taskmaster/
├── src/
│   ├── providers/      # Core task provider logic
│   ├── api/            # API route handlers
│   ├── components/     # UI components (if needed)
│   ├── types/          # TypeScript definitions
│   └── utils/          # Utility functions
└── dist/               # Compiled output
```

## Integration Examples

### With Express

```typescript
import express from 'express';
import { Taskmaster } from '@vibe-kit/taskmaster';

const app = express();

app.get('/api/tasks/:projectId', async (req, res) => {
  const project = await getProject(req.params.projectId);
  const response = await Taskmaster.api.handleGetTasks(project);
  res.json(await response.json());
});
```

### With Fastify

```typescript
import fastify from 'fastify';
import { Taskmaster } from '@vibe-kit/taskmaster';

const app = fastify();

app.get('/api/tasks/:projectId', async (request, reply) => {
  const project = await getProject(request.params.projectId);
  const response = await Taskmaster.api.handleGetTasks(project);
  return response.json();
});
```

## Contributing

The taskmaster package is designed to be framework-agnostic and self-contained. When contributing:

1. Keep all functionality within the package
2. Avoid external dependencies where possible
3. Maintain the clean export structure
4. Document any new features

## License

MIT