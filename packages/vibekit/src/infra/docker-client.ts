/**
 * Docker Client Infrastructure
 * 
 * Provides provider-agnostic Docker operations including login detection,
 * image building, pushing, pulling, and tagging.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const execAsync = promisify(exec);

export interface DockerLoginInfo {
  isLoggedIn: boolean;
  username?: string | null;
  registry?: string;
}

export interface DockerClientConfig {
  retryAttempts?: number;
  retryDelayMs?: number;
  logger?: {
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, error?: Error | any, meta?: any): void;
  };
}

// Default console logger
const defaultLogger = {
  debug: (msg: string, meta?: any) => console.debug(`[DockerClient] ${msg}`, meta || ''),
  info: (msg: string, meta?: any) => console.log(`[DockerClient] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[DockerClient] ${msg}`, meta || ''),
  error: (msg: string, error?: any, meta?: any) => console.error(`[DockerClient] ${msg}`, error, meta || ''),
};

// Retry utility with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    attempts: number;
    delayMs: number;
    logger: typeof defaultLogger;
    context: string;
  }
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      options.logger.debug(
        `${options.context} failed (attempt ${attempt}/${options.attempts})`,
        lastError
      );
      
      if (attempt < options.attempts) {
        const delay = options.delayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`${options.context} failed after ${options.attempts} attempts`);
}

export class DockerClient {
  private config: Required<DockerClientConfig>;

  constructor(config: DockerClientConfig = {}) {
    this.config = {
      retryAttempts: config.retryAttempts ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      logger: config.logger ?? defaultLogger,
    };
  }

  /**
   * Sanitize image name to prevent command injection
   */
  private sanitizeImageName(imageName: string): string {
    // Allow only valid Docker image characters
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-\/:]*(:[a-zA-Z0-9._\-]+)?$/.test(imageName)) {
      throw new Error(`Invalid image name: ${imageName}`);
    }
    return imageName;
  }

  /**
   * Sanitize file path to prevent command injection and directory traversal
   */
  private sanitizePath(path: string): string {
    // Prevent command injection characters
    if (/[;&|`$()<>]/.test(path)) {
      throw new Error(`Invalid path contains shell metacharacters: ${path}`);
    }
    // Prevent directory traversal
    if (path.includes('..')) {
      throw new Error(`Invalid path contains directory traversal: ${path}`);
    }
    return path;
  }

  /**
   * Check if user is logged into Docker Hub
   */
  async checkDockerLogin(): Promise<DockerLoginInfo> {
    const logger = this.config.logger;
    
    try {
      // Primary method: Use 'docker login' command to check current login status
      try {
        // Run docker login without credentials - this will show current login status
        const { stdout, stderr } = await execAsync('docker login', { timeout: 5000 });
        
        // Combine stdout and stderr to search for username
        const output = stdout + stderr;
        
        // Look for username in various docker login output formats
        let usernameMatch = output.match(/\[Username:\s*([^\]]+)\]/); // New format: [Username: joedanziger]
        if (!usernameMatch) {
          usernameMatch = output.match(/Username:\s*([^\s\]]+)/); // Old format: Username: joedanziger
        }
        
        if (usernameMatch) {
          return {
            isLoggedIn: true,
            username: usernameMatch[1].trim(),
            registry: "https://index.docker.io/v1/",
          };
        }
      } catch (loginError) {
        // docker login might exit with non-zero even when showing login status
        const errorStr = loginError instanceof Error ? loginError.message : String(loginError);
        
        // Look for username in error message (docker login output often goes to stderr)
        let usernameMatch = errorStr.match(/\[Username:\s*([^\]]+)\]/); // New format: [Username: joedanziger]
        if (!usernameMatch) {
          usernameMatch = errorStr.match(/Username:\s*([^\s\]]+)/); // Old format: Username: joedanziger
        }
        
        if (usernameMatch) {
          return {
            isLoggedIn: true,
            username: usernameMatch[1].trim(),
            registry: "https://index.docker.io/v1/",
          };
        }
        
        logger.debug('Docker login command check failed:', errorStr);
      }

      // Fallback method 1: Try docker info 
      try {
        const { stdout } = await execAsync("docker info");
        let usernameMatch = stdout.match(/\[Username:\s*([^\]]+)\]/); // New format
        if (!usernameMatch) {
          usernameMatch = stdout.match(/Username:\s*(.+)/); // Old format
        }
        
        if (usernameMatch) {
          return {
            isLoggedIn: true,
            username: usernameMatch[1].trim(),
            registry: "https://index.docker.io/v1/",
          };
        }
      } catch (infoError) {
        logger.debug('Docker info check failed:', infoError instanceof Error ? infoError.message : String(infoError));
      }
      
      // Fallback method 2: Check Docker config file and test authentication
      try {
        const configPath = join(homedir(), '.docker', 'config.json');
        const configContent = await readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        
        // Check if logged into Docker Hub
        if (config.auths && (config.auths['https://index.docker.io/v1/'] || config.auths['index.docker.io'])) {
          // Check if using credential store (common with Docker Desktop)
          const usingCredStore = config.credsStore || config.credHelpers;
          
          if (usingCredStore) {
            // When using credential store, test authentication by pulling a small image
            try {
              await execAsync('docker pull hello-world:latest', { timeout: 10000 });
              
              // We're authenticated but can't easily get username from credential store
              // Return with null username to signal that it needs to be provided
              return {
                isLoggedIn: true,
                username: null, // Will be handled by calling code
                registry: "https://index.docker.io/v1/",
              };
            } catch (pullError) {
              logger.debug('Docker Hub auth test failed:', pullError instanceof Error ? pullError.message : String(pullError));
              return { isLoggedIn: false };
            }
          } else {
            // Not using credential store, check for auth token
            const auth = config.auths['https://index.docker.io/v1/'] || config.auths['index.docker.io'];
            if (auth && auth.auth) {
              // Decode base64 auth to get username
              const decoded = Buffer.from(auth.auth, 'base64').toString('utf-8');
              const [username] = decoded.split(':');
              if (username) {
                return {
                  isLoggedIn: true,
                  username: username,
                  registry: "https://index.docker.io/v1/",
                };
              }
            }
          }
        }
      } catch (configError) {
        logger.debug('Config check failed:', configError instanceof Error ? configError.message : String(configError));
      }
      
      return { isLoggedIn: false };
    } catch (error) {
      logger.debug("Docker login check failed", error);
      return { isLoggedIn: false };
    }
  }

  /**
   * Check if a local Docker image exists
   */
  async checkLocalImage(tag: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`docker images -q ${tag}`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Pull a Docker image with retry logic
   */
  async pullImage(image: string): Promise<void> {
    await retryWithBackoff(
      async () => {
        await execAsync(`docker pull ${image}`);
      },
      {
        attempts: this.config.retryAttempts,
        delayMs: this.config.retryDelayMs,
        logger: this.config.logger,
        context: `Pulling image ${image}`
      }
    );
  }

  /**
   * Build a Docker image from Dockerfile
   */
  async buildImage(dockerfilePath: string, tag: string, contextPath: string = "."): Promise<void> {
    const buildCommand = `docker build -t ${tag} -f ${dockerfilePath} ${contextPath}`;
    await execAsync(buildCommand, { timeout: 600000 }); // 10 minute timeout
  }

  /**
   * Tag a Docker image
   */
  async tagImage(source: string, target: string): Promise<void> {
    await execAsync(`docker tag ${source} ${target}`);
  }

  /**
   * Push a Docker image with retry logic
   */
  async pushImage(image: string): Promise<void> {
    await retryWithBackoff(
      async () => {
        await execAsync(`docker push ${image}`);
      },
      {
        attempts: this.config.retryAttempts,
        delayMs: this.config.retryDelayMs,
        logger: this.config.logger,
        context: `Pushing image ${image}`
      }
    );
  }

  /**
   * Get list of local Docker images
   */
  async listImages(filter?: string): Promise<string[]> {
    const safeFilter = filter ? this.sanitizeImageName(filter) : '';
    const command = safeFilter ? `docker images "${safeFilter}" --format "{{.Repository}}:{{.Tag}}"` : 'docker images --format "{{.Repository}}:{{.Tag}}"';
    const { stdout } = await execAsync(command, { timeout: 30000 });
    return stdout.trim().split('\n').filter(line => line.trim());
  }

  /**
   * Remove a Docker image
   */
  async removeImage(tag: string, force: boolean = false): Promise<void> {
    const safeTag = this.sanitizeImageName(tag);
    const command = force ? `docker rmi -f "${safeTag}"` : `docker rmi "${safeTag}"`;
    await execAsync(command, { timeout: 30000 });
  }
}