import dotenv from "dotenv";
import { resolve } from "path";
import { vi } from "vitest";

dotenv.config({ path: resolve(process.cwd(), ".env") });

// Create mock factory functions to be used by vi.mock
const createDaggerMock = () => {
  // Mock container interface with realistic behavior
  const mockContainer = {
    from: vi.fn().mockReturnThis(),
    withEnvVariable: vi.fn().mockReturnThis(),
    withWorkdir: vi.fn().mockReturnThis(),
    withDirectory: vi.fn().mockReturnThis(),
    withExec: vi.fn().mockImplementation(function(this: any, command: string[]) {
      // Check if this is a command that should fail for error testing
      const fullCommand = Array.isArray(command) ? command.join(' ') : String(command);
      
      if (fullCommand.includes('nonexistent-command-xyz')) {
        // Mock container that will throw on stdout/stderr
        return {
          ...this,
          stdout: vi.fn().mockRejectedValue(new Error('resolve: process "sh -c nonexistent-command-xyz" did not complete successfully: exit code: 127')),
          stderr: vi.fn().mockResolvedValue('command not found: nonexistent-command-xyz'),
        };
      } else if (fullCommand.includes('exit 42')) {
        // Mock container that will throw on stdout/stderr with specific exit code
        return {
          ...this,
          stdout: vi.fn().mockRejectedValue(new Error('resolve: process "sh -c exit 42" did not complete successfully: exit code: 42')),
          stderr: vi.fn().mockResolvedValue(''),
        };
      }
      
      return this;
    }),
    withNewFile: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnThis(),
    export: vi.fn().mockResolvedValue(undefined),
    stdout: vi.fn().mockResolvedValue("Mock command output"),
    stderr: vi.fn().mockResolvedValue(""),
    directory: vi.fn().mockReturnValue({
      // Mock directory object for workspace persistence
      entries: vi.fn().mockResolvedValue([]),
    }),
    file: vi.fn().mockReturnValue({
      contents: vi.fn().mockResolvedValue("Mock file content"),
    }),
  };

  // Mock client interface
  const mockClient = {
    container: vi.fn().mockReturnValue(mockContainer),
    host: vi.fn().mockReturnValue({
      directory: vi.fn().mockReturnValue(mockContainer),
    }),
  };

  // Mock connect function - this is the main entry point that triggers CLI download
  const mockConnect = vi.fn().mockImplementation(async (callback: (client: any) => Promise<any>) => {
    // Call the callback with our mock client
    return await callback(mockClient);
  });

  return {
    connect: mockConnect,
    // Export mock types for TypeScript compatibility
    Client: vi.fn(),
    Container: vi.fn(),
    Directory: vi.fn(),
  };
};

// Mock the Dagger module entirely
vi.mock("@dagger.io/dagger", () => createDaggerMock());

// Mock exec functionality for Docker commands used in prebuildAgentImages
vi.mock("child_process", async () => {
  const actual = await vi.importActual("child_process");
  return {
    ...actual,
    exec: vi.fn((command, options, callback) => {
      // Mock different responses based on command
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      
      let stdout = "";
      let stderr = "";
      
      if (command.includes("docker images")) {
        // Mock existing images to simulate cached state
        stdout = "abc123def456"; // Mock image ID
      } else if (command.includes("docker pull")) {
        // Mock successful pulls
        stdout = "Pull complete";
      } else if (command.includes("docker info")) {
        stdout = "Docker info output";
      }
      
      // Simulate async execution
      setTimeout(() => {
        if (callback) {
          callback(null, { stdout, stderr });
        }
      }, 0);
    }),
  };
});

// Mock filesystem operations
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("{}"),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

// Mock util.promisify for exec operations
vi.mock("util", async () => {
  const actual = await vi.importActual("util") as any;
  return {
    ...actual,
    promisify: vi.fn((fn) => {
      if (fn.name === 'exec') {
        return vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      }
      return actual.promisify(fn);
    }),
  };
});
