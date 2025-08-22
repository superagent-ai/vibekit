import { describe, it, expect } from 'vitest';

describe('client exports', () => {
  it('should export ChatInterface and ChatInterfaceProps', async () => {
    const clientModule = await import('../src/client');
    
    expect(clientModule.ChatInterface).toBeDefined();
    expect(typeof clientModule.ChatInterface).toBe('function');
  });

  it('should export hooks', async () => {
    const clientModule = await import('../src/client');
    
    expect(clientModule.useChat).toBeDefined();
    expect(clientModule.useAuthStatus).toBeDefined();
    expect(typeof clientModule.useChat).toBe('function');
    expect(typeof clientModule.useAuthStatus).toBe('function');
  });

  it('should export config constants', async () => {
    const clientModule = await import('../src/client');
    
    expect(clientModule.DEFAULT_MODELS).toBeDefined();
    expect(clientModule.DEFAULT_CHAT_CONFIG).toBeDefined();
    expect(Array.isArray(clientModule.DEFAULT_MODELS)).toBe(true);
    expect(typeof clientModule.DEFAULT_CHAT_CONFIG).toBe('object');
  });

  it('should have all expected exports available', async () => {
    const clientModule = await import('../src/client');
    
    // Verify all exports from the module
    const expectedExports = [
      'ChatInterface',
      'useChat', 
      'useAuthStatus',
      'DEFAULT_MODELS',
      'DEFAULT_CHAT_CONFIG'
    ];
    
    expectedExports.forEach(exportName => {
      expect(clientModule).toHaveProperty(exportName);
      expect(clientModule[exportName]).toBeDefined();
    });
  });

  it('should export types correctly (compilation test)', async () => {
    // This test ensures TypeScript types are properly exported
    // We can't directly test types at runtime, but we can test that imports don't throw
    const clientModule = await import('../src/client');
    
    // Verify that the module loaded without error
    expect(clientModule).toBeTruthy();
    
    // Test that DEFAULT_MODELS has the expected structure
    expect(clientModule.DEFAULT_MODELS.length).toBeGreaterThan(0);
    expect(clientModule.DEFAULT_MODELS[0]).toHaveProperty('name');
    expect(clientModule.DEFAULT_MODELS[0]).toHaveProperty('value');
    expect(clientModule.DEFAULT_MODELS[0]).toHaveProperty('provider');
    
    // Test that DEFAULT_CHAT_CONFIG has the expected structure  
    expect(clientModule.DEFAULT_CHAT_CONFIG).toHaveProperty('model');
    expect(clientModule.DEFAULT_CHAT_CONFIG).toHaveProperty('temperature');
    expect(clientModule.DEFAULT_CHAT_CONFIG).toHaveProperty('maxTokens');
  });
});