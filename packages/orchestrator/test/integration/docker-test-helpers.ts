import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DockerTestHelpers {
  /**
   * Check if Docker is available and running
   */
  static async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if VibeKit image exists locally
   */
  static async isVibeKitImageAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('docker images vibekit-sandbox:latest --format "table {{.Repository}}:{{.Tag}}"');
      return stdout.includes('vibekit-sandbox:latest');
    } catch {
      return false;
    }
  }

  /**
   * Get list of running containers matching a pattern
   */
  static async getRunningContainers(pattern?: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
      const containers = stdout.trim().split('\n').filter(name => name.trim());
      
      if (pattern) {
        return containers.filter(name => name.includes(pattern));
      }
      
      return containers;
    } catch {
      return [];
    }
  }

  /**
   * Wait for condition to be true with timeout
   */
  static async waitForCondition(
    condition: () => Promise<boolean>, 
    timeoutMs: number = 10000,
    intervalMs: number = 100
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    return false;
  }

  /**
   * Kill containers by name pattern
   */
  static async killContainersByPattern(pattern: string): Promise<void> {
    try {
      const containers = await this.getRunningContainers(pattern);
      
      if (containers.length > 0) {
        const killPromises = containers.map(container => 
          execAsync(`docker kill ${container}`)
        );
        
        await Promise.all(killPromises);
        console.log(`🧹 Killed ${containers.length} containers matching pattern: ${pattern}`);
      }
    } catch (error) {
      console.warn(`⚠️  Error killing containers: ${error}`);
    }
  }

  /**
   * Measure execution time of an async function
   */
  static async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;
    
    return { result, duration };
  }

  /**
   * Create a test session ID for cleanup
   */
  static generateTestSessionId(prefix: string = 'integration-test'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Clean up test resources
   */
  static async cleanup(sessionId: string): Promise<void> {
    console.log(`🧹 Cleaning up test resources for session: ${sessionId}`);
    
    // Kill any containers from this test session
    await this.killContainersByPattern(sessionId);
    
    // Clean up any Docker volumes (Dagger cache volumes)
    try {
      await execAsync(`docker volume ls --format "{{.Name}}" | grep ${sessionId} | xargs -r docker volume rm`);
    } catch (error) {
      console.warn(`⚠️  Error cleaning up volumes: ${error}`);
    }
  }

  /**
   * Skip test if Docker is not available
   */
  static skipIfDockerUnavailable(): void {
    // This would be called from test setup - implementation depends on test runner
  }
}