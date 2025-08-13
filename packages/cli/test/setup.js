import { vi } from 'vitest';

// Global test setup
beforeEach(() => {
  // Clear all timers
  vi.useRealTimers();
  
  // Reset environment variables
  delete process.env.VIBEKIT_DEBUG;
  delete process.env.VIBEKIT_CREDENTIALS_ENABLED;
  delete process.env.VIBEKIT_CACHE_ENABLED;
  delete process.env.VIBEKIT_VOLUME_DEBUG;
  
  // Mock console methods to avoid noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});