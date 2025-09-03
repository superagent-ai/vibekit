import { vi } from 'vitest';

// Mock Node.js environment
process.env.NODE_ENV = 'test';

// Mock fastmcp
vi.mock('fastmcp', () => ({
  FastMCP: vi.fn().mockImplementation(() => ({
    tool: vi.fn(),
    resource: vi.fn(),
    prompt: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    serve: vi.fn(),
  })),
}));

// Mock @vibe-kit/projects
vi.mock('@vibe-kit/projects', () => ({
  getAllProjects: vi.fn().mockResolvedValue([]),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getCurrentProject: vi.fn(),
  setCurrentProject: vi.fn(),
}));

// Mock file system operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock process.argv for testing different command line arguments
Object.defineProperty(process, 'argv', {
  value: ['node', 'dist/index.js'],
  writable: true,
});