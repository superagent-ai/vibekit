import { describe, it, expect } from 'vitest';
import { SimpleProjectDetector } from '../src/detector/SimpleProjectDetector';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('SimpleProjectDetector', () => {
  describe('analyzeNodeProject', () => {
    it('should detect Next.js project correctly', async () => {
      const packageJson = {
        dependencies: {
          'next': '^14.0.0',
          'react': '^18.0.0'
        },
        scripts: {
          dev: 'next dev',
          build: 'next build'
        }
      };

      const result = SimpleProjectDetector['analyzeNodeProject'](packageJson);
      
      expect(result.type).toBe('nextjs');
      expect(result.framework?.name).toBe('Next.js');
      expect(result.devCommand).toBe('npm run dev');
      expect(result.port).toBe(3000);
    });

    it('should detect React (Vite) project correctly', async () => {
      const packageJson = {
        dependencies: {
          'react': '^18.0.0'
        },
        devDependencies: {
          'vite': '^5.0.0'
        },
        scripts: {
          dev: 'vite',
          build: 'vite build'
        }
      };

      const result = SimpleProjectDetector['analyzeNodeProject'](packageJson);
      
      expect(result.type).toBe('react');
      expect(result.framework?.name).toBe('React (Vite)');
      expect(result.devCommand).toBe('npm run dev');
      expect(result.port).toBe(5173);
    });

    it('should detect Vue.js project correctly', async () => {
      const packageJson = {
        dependencies: {
          'vue': '^3.0.0'
        },
        scripts: {
          serve: 'vue-cli-service serve',
          build: 'vue-cli-service build'
        }
      };

      const result = SimpleProjectDetector['analyzeNodeProject'](packageJson);
      
      expect(result.type).toBe('vue');
      expect(result.framework?.name).toBe('Vue.js');
      expect(result.devCommand).toBe('npm run serve');
      expect(result.port).toBe(8080);
    });

    it('should detect Express.js project correctly', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0'
        },
        scripts: {
          start: 'node server.js',
          dev: 'nodemon server.js'
        }
      };

      const result = SimpleProjectDetector['analyzeNodeProject'](packageJson);
      
      expect(result.type).toBe('node');
      expect(result.framework?.name).toBe('Express.js');
      expect(result.devCommand).toBe('npm run dev');
      expect(result.port).toBe(3000);
    });

    it('should handle projects with no dev script', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0'
        },
        scripts: {
          start: 'node server.js'
        }
      };

      const result = SimpleProjectDetector['analyzeNodeProject'](packageJson);
      
      expect(result.type).toBe('node');
      expect(result.devCommand).toBe('npm start');
    });
  });

  describe('hasFilesWithExtension', () => {
    it('should detect files with specified extension', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
      
      // Create test files
      await fs.writeFile(path.join(tempDir, 'test.py'), 'print("hello")');
      await fs.writeFile(path.join(tempDir, 'test.js'), 'console.log("hello")');
      
      const hasPython = await SimpleProjectDetector['hasFilesWithExtension'](tempDir, '.py');
      const hasJavaScript = await SimpleProjectDetector['hasFilesWithExtension'](tempDir, '.js');
      const hasTypeScript = await SimpleProjectDetector['hasFilesWithExtension'](tempDir, '.ts');
      
      expect(hasPython).toBe(true);
      expect(hasJavaScript).toBe(true);
      expect(hasTypeScript).toBe(false);
      
      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });

  describe('detectProject', () => {
    it('should detect static project when index.html exists', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
      
      // Create index.html
      await fs.writeFile(path.join(tempDir, 'index.html'), '<html></html>');
      
      const result = await SimpleProjectDetector.detectProject(tempDir);
      
      expect(result.type).toBe('static');
      expect(result.devCommand).toContain('server');
      expect(result.devCommand).toContain('StaticServer.js');
      expect(result.port).toBe(8080);
      
      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });

    it('should detect Python project when .py files exist', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
      
      // Create Python file
      await fs.writeFile(path.join(tempDir, 'app.py'), 'print("hello")');
      
      const result = await SimpleProjectDetector.detectProject(tempDir);
      
      expect(result.type).toBe('python');
      expect(result.devCommand).toBe('python3 -m http.server 8000 --bind 127.0.0.1');
      expect(result.port).toBe(8000);
      
      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });
  });
});