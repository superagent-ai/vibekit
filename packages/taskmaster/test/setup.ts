import { vi } from 'vitest';

// Mock Node.js environment
process.env.NODE_ENV = 'test';

// Mock chokidar for file watching
vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
    add: vi.fn(),
    unwatch: vi.fn(),
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

// Mock @dnd-kit dependencies for SSR compatibility
vi.mock('@dnd-kit/core', () => ({
  DndContext: vi.fn(({ children }) => children),
  useDraggable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
  })),
  useDroppable: vi.fn(() => ({
    setNodeRef: vi.fn(),
    isOver: false,
  })),
  DragOverlay: vi.fn(({ children }) => children),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: vi.fn(({ children }) => children),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
  verticalListSortingStrategy: 'vertical',
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: vi.fn(() => ''),
    },
  },
}));

// Mock file system operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
}));