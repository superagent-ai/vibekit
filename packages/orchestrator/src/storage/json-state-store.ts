import * as fs from 'fs/promises';
import * as path from 'path';

export class JSONStateStore {
  private cache: Map<string, any> = new Map();
  private basePath = '.vibekit/orchestrator';

  private getStatePath(key: string): string {
    return path.join(this.basePath, `${key}.json`);
  }

  async saveState<T>(key: string, state: T): Promise<void> {
    const filePath = this.getStatePath(key);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Write atomically with temp file
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, this.jsonReplacer, 2));
    await fs.rename(tempPath, filePath);
    
    // Update cache
    this.cache.set(key, state);
  }

  async loadState<T>(key: string): Promise<T | null> {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    const filePath = this.getStatePath(key);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const state = JSON.parse(content, this.jsonReviver) as T;
      
      // Cache for future reads
      this.cache.set(key, state);
      
      return state;
    } catch (error: any) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  // Partial state updates without loading entire file
  async updateState<T>(key: string, updates: Partial<T>): Promise<void> {
    const current = await this.loadState<T>(key) || {} as T;
    const updated = { ...current, ...updates };
    await this.saveState(key, updated);
  }

  async deleteState(key: string): Promise<void> {
    const filePath = this.getStatePath(key);
    
    try {
      await fs.unlink(filePath);
      this.cache.delete(key);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async listStates(prefix?: string): Promise<string[]> {
    try {
      const files = await this.getAllJsonFiles(this.basePath);
      let keys = files
        .filter(file => file.endsWith('.json'))
        .map(file => path.relative(this.basePath, file))
        .map(file => file.replace('.json', ''));
      
      if (prefix) {
        keys = keys.filter(key => key.startsWith(prefix));
      }
      
      return keys;
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  private async getAllJsonFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.getAllJsonFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          files.push(fullPath);
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
    
    return files;
  }

  // Custom JSON serialization to handle special types
  private jsonReplacer(key: string, value: any): any {
    if (value instanceof Map) {
      return {
        __type: 'Map',
        __value: Array.from(value.entries())
      };
    }
    if (value instanceof Date) {
      return {
        __type: 'Date',
        __value: value.toISOString()
      };
    }
    return value;
  }

  // Custom JSON deserialization to restore special types
  private jsonReviver(key: string, value: any): any {
    if (value && typeof value === 'object' && value.__type) {
      switch (value.__type) {
        case 'Map':
          return new Map(value.__value);
        case 'Date':
          return new Date(value.__value);
        default:
          return value;
      }
    }
    return value;
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  // Backup and restore functionality
  async backupState(key: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupKey = `${key}.backup.${timestamp}`;
    
    const state = await this.loadState(key);
    if (state) {
      await this.saveState(backupKey, state);
      return backupKey;
    }
    
    throw new Error(`State not found: ${key}`);
  }

  async restoreFromBackup(backupKey: string, targetKey: string): Promise<void> {
    const backupState = await this.loadState(backupKey);
    if (!backupState) {
      throw new Error(`Backup not found: ${backupKey}`);
    }
    
    await this.saveState(targetKey, backupState);
  }

  // Validate JSON file integrity
  async validateState(key: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const filePath = this.getStatePath(key);
      const content = await fs.readFile(filePath, 'utf8');
      JSON.parse(content);
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }
}