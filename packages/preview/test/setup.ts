import { vi } from 'vitest';

// Mock @vibe-kit/logger
vi.mock('@vibe-kit/logger', () => ({
  createLogger: (name: string) => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));