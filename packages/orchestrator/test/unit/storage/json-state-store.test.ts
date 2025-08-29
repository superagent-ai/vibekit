import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSONStateStore } from '../../../src/storage/json-state-store';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TestState {
  id: string;
  name: string;
  count: number;
  items: string[];
  metadata: Map<string, any>;
  createdAt: Date;
}

describe('JSONStateStore', () => {
  let stateStore: JSONStateStore;
  const testDir = '.vibekit-test';

  beforeEach(async () => {
    stateStore = new JSONStateStore();
    // Override basePath for testing
    (stateStore as any).basePath = testDir;
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('saveState and loadState', () => {
    it('should save and load simple state', async () => {
      const testState = {
        id: 'test-123',
        name: 'Test State',
        count: 42
      };

      await stateStore.saveState('test/simple', testState);
      const loaded = await stateStore.loadState('test/simple');

      expect(loaded).toEqual(testState);
    });

    it('should handle complex state with Maps and Dates', async () => {
      const testState: TestState = {
        id: 'complex-123',
        name: 'Complex State',
        count: 100,
        items: ['item1', 'item2', 'item3'],
        metadata: new Map([
          ['key1', 'value1'],
          ['key2', { nested: 'object' }],
          ['key3', 42]
        ]),
        createdAt: new Date('2023-01-01T12:00:00Z')
      };

      await stateStore.saveState('test/complex', testState);
      const loaded = await stateStore.loadState<TestState>('test/complex');

      expect(loaded).toBeTruthy();
      expect(loaded!.id).toBe(testState.id);
      expect(loaded!.name).toBe(testState.name);
      expect(loaded!.count).toBe(testState.count);
      expect(loaded!.items).toEqual(testState.items);
      expect(loaded!.metadata).toBeInstanceOf(Map);
      expect(loaded!.metadata.get('key1')).toBe('value1');
      expect(loaded!.metadata.get('key2')).toEqual({ nested: 'object' });
      expect(loaded!.metadata.get('key3')).toBe(42);
      expect(loaded!.createdAt).toBeInstanceOf(Date);
      expect(loaded!.createdAt.getTime()).toBe(testState.createdAt.getTime());
    });

    it('should return null for non-existent state', async () => {
      const loaded = await stateStore.loadState('non-existent');
      expect(loaded).toBeNull();
    });

    it('should use cache for subsequent reads', async () => {
      const testState = { id: 'cache-test', value: 'cached' };
      
      await stateStore.saveState('cache-test', testState);
      
      // First load - from file
      const loaded1 = await stateStore.loadState('cache-test');
      
      // Second load - from cache
      const loaded2 = await stateStore.loadState('cache-test');
      
      expect(loaded1).toEqual(testState);
      expect(loaded2).toEqual(testState);
      
      // Check cache stats
      const stats = stateStore.getCacheStats();
      expect(stats.keys).toContain('cache-test');
    });
  });

  describe('updateState', () => {
    it('should update existing state partially', async () => {
      const initialState = {
        id: 'update-test',
        name: 'Original Name',
        count: 10,
        active: true
      };

      await stateStore.saveState('update-test', initialState);

      await stateStore.updateState('update-test', {
        name: 'Updated Name',
        count: 20
      });

      const updated = await stateStore.loadState('update-test');
      expect(updated).toEqual({
        id: 'update-test',
        name: 'Updated Name',
        count: 20,
        active: true
      });
    });

    it('should create new state if it does not exist', async () => {
      const updates = {
        id: 'new-state',
        name: 'New State'
      };

      await stateStore.updateState('new-state', updates);

      const loaded = await stateStore.loadState('new-state');
      expect(loaded).toEqual(updates);
    });
  });

  describe('deleteState', () => {
    it('should delete existing state', async () => {
      const testState = { id: 'delete-me', value: 'gone' };
      
      await stateStore.saveState('delete-test', testState);
      
      // Verify it exists
      let loaded = await stateStore.loadState('delete-test');
      expect(loaded).toEqual(testState);
      
      // Delete it
      await stateStore.deleteState('delete-test');
      
      // Verify it's gone
      loaded = await stateStore.loadState('delete-test');
      expect(loaded).toBeNull();
    });

    it('should not throw error when deleting non-existent state', async () => {
      await expect(stateStore.deleteState('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('listStates', () => {
    it('should list all state keys', async () => {
      await stateStore.saveState('list-test/state1', { id: 1 });
      await stateStore.saveState('list-test/state2', { id: 2 });
      await stateStore.saveState('other/state3', { id: 3 });

      const allKeys = await stateStore.listStates();
      expect(allKeys).toContain('list-test/state1');
      expect(allKeys).toContain('list-test/state2');
      expect(allKeys).toContain('other/state3');
    });

    it('should filter states by prefix', async () => {
      await stateStore.saveState('sessions/session1', { id: 1 });
      await stateStore.saveState('sessions/session2', { id: 2 });
      await stateStore.saveState('checkpoints/checkpoint1', { id: 3 });

      const sessionKeys = await stateStore.listStates('sessions/');
      expect(sessionKeys).toHaveLength(2);
      expect(sessionKeys).toContain('sessions/session1');
      expect(sessionKeys).toContain('sessions/session2');
      expect(sessionKeys).not.toContain('checkpoints/checkpoint1');
    });
  });

  describe('backup and restore', () => {
    it('should backup and restore state', async () => {
      const originalState = { id: 'backup-test', data: 'important' };
      
      await stateStore.saveState('backup-source', originalState);
      
      const backupKey = await stateStore.backupState('backup-source');
      expect(backupKey).toContain('backup-source.backup.');
      
      // Modify original
      await stateStore.saveState('backup-source', { id: 'modified', data: 'changed' });
      
      // Restore from backup
      await stateStore.restoreFromBackup(backupKey, 'backup-restored');
      
      const restored = await stateStore.loadState('backup-restored');
      expect(restored).toEqual(originalState);
    });

    it('should throw error when backing up non-existent state', async () => {
      await expect(stateStore.backupState('non-existent')).rejects.toThrow('State not found: non-existent');
    });

    it('should throw error when restoring from non-existent backup', async () => {
      await expect(stateStore.restoreFromBackup('non-existent', 'target')).rejects.toThrow('Backup not found: non-existent');
    });
  });

  describe('validateState', () => {
    it('should validate correct JSON file', async () => {
      const testState = { id: 'valid', data: 'good' };
      await stateStore.saveState('validation-test', testState);

      const result = await stateStore.validateState('validation-test');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect invalid JSON file', async () => {
      const filePath = path.join(testDir, 'invalid.json');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, '{ invalid json }');

      const result = await stateStore.validateState('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle non-existent file', async () => {
      const result = await stateStore.validateState('non-existent');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      await stateStore.saveState('cache1', { id: 1 });
      await stateStore.saveState('cache2', { id: 2 });
      
      // Load to populate cache
      await stateStore.loadState('cache1');
      await stateStore.loadState('cache2');
      
      let stats = stateStore.getCacheStats();
      expect(stats.size).toBe(2);
      
      stateStore.clearCache();
      
      stats = stateStore.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should provide cache statistics', async () => {
      await stateStore.saveState('stats1', { id: 1 });
      await stateStore.saveState('stats2', { id: 2 });
      
      await stateStore.loadState('stats1');
      
      const stats = stateStore.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.keys).toEqual(['stats1']);
    });
  });
});