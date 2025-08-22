import { vi } from 'vitest';

// Mock Node.js environment
process.env.NODE_ENV = 'test';

// Mock file system operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock fs for synchronous operations
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock execa for subprocess management
vi.mock('execa', () => ({
  default: vi.fn(),
  execa: vi.fn(),
}));