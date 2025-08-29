import { describe, it, expect, vi } from 'vitest';
import type { AIProvider } from '../../src/providers/base';
import type { LanguageModel } from 'ai';

describe('AIProvider interface', () => {
  it('should define the correct interface structure', () => {
    // Create a mock implementation to test the interface
    const mockProvider: AIProvider = {
      name: 'Test Provider',
      createModel: (modelId: string): LanguageModel => {
        return {
          // Mock LanguageModel properties
          specificationVersion: 'v1',
          provider: 'test',
          modelId: modelId,
          settings: {},
          doGenerate: vi.fn(),
          doStream: vi.fn()
        } as any;
      },
      isAvailable: (): boolean => true,
      getAvailableModels: () => [
        { name: 'Test Model', value: 'test-model' }
      ]
    };

    // Test interface properties
    expect(mockProvider.name).toBe('Test Provider');
    expect(typeof mockProvider.createModel).toBe('function');
    expect(typeof mockProvider.isAvailable).toBe('function');
    expect(typeof mockProvider.getAvailableModels).toBe('function');

    // Test method return types
    const model = mockProvider.createModel('test-model-id');
    expect(model).toBeDefined();
    expect(model.modelId).toBe('test-model-id');

    const isAvailable = mockProvider.isAvailable();
    expect(typeof isAvailable).toBe('boolean');

    const models = mockProvider.getAvailableModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models[0]).toHaveProperty('name');
    expect(models[0]).toHaveProperty('value');
  });

  it('should enforce correct method signatures', () => {
    // Test that the interface requires specific method signatures
    const provider: AIProvider = {
      name: 'Interface Test',
      createModel: (modelId: string) => ({} as LanguageModel),
      isAvailable: () => true,
      getAvailableModels: () => []
    };

    expect(provider.createModel('test')).toBeDefined();
    expect(provider.isAvailable()).toBe(true);
    expect(provider.getAvailableModels()).toEqual([]);
  });
});