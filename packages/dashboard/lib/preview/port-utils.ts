import net from 'net';
import { createLogger } from '@vibe-kit/logger';

const logger = createLogger('PortUtils');

/**
 * Port management utilities
 */
export class PortUtils {
  /**
   * Check if a port is available
   */
  static async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        server.close();
        resolve(false);
      }, 2000);
      
      server.listen(port, '127.0.0.1', () => {
        clearTimeout(timeout);
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      });
      
      server.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Find an available port starting from a preferred port
   */
  static async findAvailablePort(preferredPort: number = 3000, maxPort: number = preferredPort + 100): Promise<number> {
    logger.debug('Finding available port', { preferredPort, maxPort });
    
    for (let port = preferredPort; port <= maxPort; port++) {
      const available = await this.isPortAvailable(port);
      if (available) {
        logger.debug('Found available port', { port });
        return port;
      }
    }
    
    throw new Error(`No available ports found between ${preferredPort} and ${maxPort}`);
  }

  /**
   * Get a random port in a safe range
   */
  static async getRandomAvailablePort(): Promise<number> {
    const minPort = 3000;
    const maxPort = 9000;
    
    // Try a few random ports first
    for (let attempt = 0; attempt < 10; attempt++) {
      const randomPort = Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort;
      const available = await this.isPortAvailable(randomPort);
      if (available) {
        return randomPort;
      }
    }
    
    // Fall back to sequential search
    return this.findAvailablePort(3000);
  }

  /**
   * Validate port number
   */
  static isValidPort(port: number): boolean {
    return Number.isInteger(port) && port > 0 && port <= 65535;
  }

  /**
   * Get ports that are commonly used for different frameworks
   */
  static getFrameworkDefaultPorts(frameworkName?: string): number[] {
    const defaultPorts: Record<string, number[]> = {
      'Next.js': [3000, 3001, 3002],
      'React (Vite)': [5173, 5174, 5175],
      'Vue.js': [8080, 8081, 8082],
      'Nuxt.js': [3000, 3001, 3002],
      'Express.js': [3000, 3001, 3002],
      'SvelteKit': [5173, 5174, 5175],
      'Create React App': [3000, 3001, 3002],
    };

    if (frameworkName && defaultPorts[frameworkName]) {
      return defaultPorts[frameworkName];
    }

    return [3000, 3001, 3002];
  }
}