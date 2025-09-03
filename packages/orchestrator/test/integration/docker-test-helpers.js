import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DockerTestHelpers {
  static async isDockerAvailable() {
    try {
      await execAsync('docker version');
      return true;
    } catch {
      return false;
    }
  }

  static async isVibeKitImageAvailable() {
    try {
      const { stdout } = await execAsync('docker images vibekit-sandbox:latest --format "table {{.Repository}}:{{.Tag}}"');
      return stdout.includes('vibekit-sandbox:latest');
    } catch {
      return false;
    }
  }

  static async getRunningContainers(pattern) {
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

  static async killContainersByPattern(pattern) {
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

  static async measureTime(fn) {
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;
    
    return { result, duration };
  }

  static generateTestSessionId(prefix = 'integration-test') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }

  static async cleanup(sessionId) {
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
}