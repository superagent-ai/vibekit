import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

/**
 * In-memory mutex for file locking within the same process
 */
class FileMutex {
  private locks = new Map<string, Promise<void>>();
  
  /**
   * Execute a function with exclusive access to a file
   * @param filepath - Path to the file to lock
   * @param fn - Function to execute with the lock
   * @returns Result of the function
   */
  async withLock<T>(filepath: string, fn: () => Promise<T>): Promise<T> {
    // Normalize the filepath to avoid duplicate locks
    const normalizedPath = path.resolve(filepath);
    
    // Wait for any existing lock on this file
    const existingLock = this.locks.get(normalizedPath);
    if (existingLock) {
      await existingLock;
    }
    
    // Create a new lock for this operation
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    
    this.locks.set(normalizedPath, lockPromise);
    
    try {
      // Execute the function with exclusive access
      const result = await fn();
      return result;
    } finally {
      // Release the lock
      releaseLock!();
      
      // Clean up if this was the last lock
      if (this.locks.get(normalizedPath) === lockPromise) {
        this.locks.delete(normalizedPath);
      }
    }
  }
  
  /**
   * Check if a file is currently locked
   * @param filepath - Path to check
   * @returns true if the file is locked
   */
  isLocked(filepath: string): boolean {
    const normalizedPath = path.resolve(filepath);
    return this.locks.has(normalizedPath);
  }
  
  /**
   * Get the number of active locks
   * @returns Number of files currently locked
   */
  getActiveLockCount(): number {
    return this.locks.size;
  }
}

/**
 * Safe file writer with atomic operations and retry logic
 * 
 * Features:
 * - Atomic writes using temp files and rename
 * - In-memory mutex for preventing concurrent writes
 * - Exponential backoff retry logic
 * - Crash-safe operations
 */
export class SafeFileWriter {
  private static mutex = new FileMutex();
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_RETRY_DELAY = 100; // ms
  
  /**
   * Safely append data to a file with atomic operations
   * @param filepath - Path to the file
   * @param data - Data to append
   * @param options - Write options
   */
  static async appendFile(
    filepath: string,
    data: string | Buffer,
    options?: { encoding?: BufferEncoding; mode?: number }
  ): Promise<void> {
    return this.mutex.withLock(filepath, async () => {
      await this.appendFileAtomic(filepath, data, options);
    });
  }
  
  /**
   * Safely write data to a file (overwrites existing content)
   * @param filepath - Path to the file
   * @param data - Data to write
   * @param options - Write options
   */
  static async writeFile(
    filepath: string,
    data: string | Buffer,
    options?: { encoding?: BufferEncoding; mode?: number }
  ): Promise<void> {
    return this.mutex.withLock(filepath, async () => {
      await this.writeFileAtomic(filepath, data, options);
    });
  }
  
  /**
   * Perform atomic append operation with retry logic
   */
  private static async appendFileAtomic(
    filepath: string,
    data: string | Buffer,
    options?: { encoding?: BufferEncoding; mode?: number }
  ): Promise<void> {
    const dir = path.dirname(filepath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    let lastError: Error | null = null;
    let retryDelay = this.INITIAL_RETRY_DELAY;
    
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        // Check if file exists
        let existingContent: Buffer = Buffer.alloc(0);
        try {
          const fileContent = await fs.readFile(filepath);
          existingContent = Buffer.from(fileContent);
        } catch (error: any) {
          // File doesn't exist, which is fine for append
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
        
        // Combine existing content with new data
        const newData = Buffer.isBuffer(data) ? data : Buffer.from(data, options?.encoding || 'utf8');
        const newContent = Buffer.concat([existingContent, newData]);
        
        // Write atomically
        await this.writeFileAtomic(filepath, newContent, options);
        return; // Success
        
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          throw error;
        }
        
        // Wait before retrying with exponential backoff
        if (attempt < this.MAX_RETRIES) {
          await this.delay(retryDelay);
          retryDelay *= 2;
        }
      }
    }
    
    // All retries failed
    throw new Error(`Failed to append to file after ${this.MAX_RETRIES + 1} attempts: ${lastError?.message}`);
  }
  
  /**
   * Perform atomic write operation
   */
  private static async writeFileAtomic(
    filepath: string,
    data: string | Buffer,
    options?: { encoding?: BufferEncoding; mode?: number }
  ): Promise<void> {
    const dir = path.dirname(filepath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Generate unique temp file name
    const tempFile = `${filepath}.tmp.${process.pid}.${randomBytes(8).toString('hex')}`;
    
    try {
      // Write to temp file with secure permissions (owner-only access)
      await fs.writeFile(tempFile, data, {
        encoding: options?.encoding,
        mode: options?.mode || 0o600, // Changed from 0o644 to 0o600 for security
        flag: 'w'
      });
      
      // Ensure data is flushed to disk
      const handle = await fs.open(tempFile, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      
      // Atomic rename (this is atomic on POSIX systems)
      await fs.rename(tempFile, filepath);
      
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
  
  /**
   * Safely update a JSON file
   * @param filepath - Path to the JSON file
   * @param updater - Function to update the JSON data
   */
  static async updateJSON<T>(
    filepath: string,
    updater: (data: T) => T | Promise<T>,
    defaultValue: T
  ): Promise<T> {
    return this.mutex.withLock(filepath, async () => {
      let currentData: T;
      
      // Read existing data or use default
      try {
        const content = await fs.readFile(filepath, 'utf8');
        currentData = JSON.parse(content);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          currentData = defaultValue;
        } else if (error instanceof SyntaxError) {
          // Corrupted JSON, use default
          console.warn(`Corrupted JSON in ${filepath}, using default value`);
          currentData = defaultValue;
        } else {
          throw error;
        }
      }
      
      // Update the data
      const newData = await updater(currentData);
      
      // Write back atomically
      await this.writeFileAtomic(filepath, JSON.stringify(newData, null, 2));
      
      return newData;
    });
  }
  
  /**
   * Create a write stream with atomic operations
   * @param filepath - Path to the file
   * @returns Object with write and close methods
   */
  static createWriteSession(filepath: string) {
    const buffer: string[] = [];
    let closed = false;
    
    return {
      write: (data: string) => {
        if (closed) {
          throw new Error('Write session is closed');
        }
        buffer.push(data);
      },
      
      close: async () => {
        if (closed) {
          return;
        }
        closed = true;
        
        if (buffer.length > 0) {
          await SafeFileWriter.appendFile(filepath, buffer.join(''));
        }
      },
      
      flush: async () => {
        if (closed) {
          throw new Error('Write session is closed');
        }
        
        if (buffer.length > 0) {
          await SafeFileWriter.appendFile(filepath, buffer.join(''));
          buffer.length = 0; // Clear buffer
        }
      }
    };
  }
  
  /**
   * Helper function for delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get mutex statistics
   */
  static getStats() {
    return {
      activeLocks: this.mutex.getActiveLockCount()
    };
  }
}

// Export convenience functions
export const safeAppendFile = SafeFileWriter.appendFile.bind(SafeFileWriter);
export const safeWriteFile = SafeFileWriter.writeFile.bind(SafeFileWriter);
export const safeUpdateJSON = SafeFileWriter.updateJSON.bind(SafeFileWriter);