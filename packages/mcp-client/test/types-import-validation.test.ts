import { describe, it, expect } from 'vitest';

describe('Types Import Validation', () => {
  it('should import client types without errors', async () => {
    // Dynamic import to potentially trigger coverage
    const clientTypes = await import('../src/client/types');
    
    expect(clientTypes).toBeDefined();
    expect(typeof clientTypes).toBe('object');
  });

  it('should import server types without errors', async () => {
    const serverTypes = await import('../src/types/server');
    
    expect(serverTypes).toBeDefined();
    expect(typeof serverTypes).toBe('object');
    
    // Verify specific exports exist
    expect(serverTypes.TransportTypeSchema).toBeDefined();
    expect(serverTypes.ServerStatusSchema).toBeDefined();
    expect(serverTypes.MCPServerSchema).toBeDefined();
  });

  it('should import tool types without errors', async () => {
    const toolTypes = await import('../src/types/tools');
    
    expect(toolTypes).toBeDefined();
    expect(typeof toolTypes).toBe('object');
    
    // Verify specific exports exist
    expect(toolTypes.ToolSchema).toBeDefined();
    expect(toolTypes.ResourceSchema).toBeDefined();
    expect(toolTypes.PromptSchema).toBeDefined();
  });

  it('should handle type re-exports correctly', async () => {
    // Test that we can import and use type definitions
    const { MCPServerSchema } = await import('../src/types/server');
    const { ToolSchema } = await import('../src/types/tools');
    
    expect(typeof MCPServerSchema.parse).toBe('function');
    expect(typeof ToolSchema.parse).toBe('function');
  });
});