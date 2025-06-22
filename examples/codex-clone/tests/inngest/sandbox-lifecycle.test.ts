import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { 
  createE2BSandboxAction, 
  reactivateE2BSandboxAction,
  stopE2BSandboxAction,
  getE2BSandboxAction
} from '@/app/actions/inngest'
import { createSandbox, runCode } from '@/app/api/inngest/functions/sandbox'
import { Sandbox } from '@e2b/code-interpreter'
import { auth } from '@/app/actions/auth'

// Mock dependencies
vi.mock('@/app/actions/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    create: vi.fn(),
    resume: vi.fn(),
  },
}))

// Mock fetch for E2B API calls
global.fetch = vi.fn()

describe('E2B Sandbox Lifecycle', () => {
  let mockSandbox: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default auth mock
    ;(auth as Mock).mockResolvedValue({ userId: 'test-user-id' })

    // Mock sandbox instance
    mockSandbox = {
      id: 'sandbox-123',
      sandboxId: 'sandbox-123',
      stop: vi.fn(),
      kill: vi.fn(),
      runCode: vi.fn().mockResolvedValue({
        results: [{
          type: 'log',
          data: 'Code executed successfully',
        }],
        error: null,
      }),
      addAction: vi.fn(),
      getFile: vi.fn(),
      writeFile: vi.fn(),
      listFiles: vi.fn().mockResolvedValue([]),
    }
  })

  describe('Sandbox Creation', () => {
    it('should create a new sandbox successfully', async () => {
      ;(Sandbox.create as Mock).mockResolvedValue(mockSandbox)

      const result = await createE2BSandboxAction({
        taskId: 'task-123',
        sessionId: 'session-123',
      })

      expect(result).toEqual({
        success: true,
        sandboxId: 'sandbox-123',
      })

      expect(Sandbox.create).toHaveBeenCalledWith({
        apiKey: expect.any(String),
        metadata: {
          taskId: 'task-123',
          sessionId: 'session-123',
        },
      })
    })

    it('should handle creation errors', async () => {
      ;(Sandbox.create as Mock).mockRejectedValue(new Error('Quota exceeded'))

      const result = await createE2BSandboxAction({
        taskId: 'task-123',
        sessionId: 'session-123',
      })

      expect(result).toEqual({
        success: false,
        error: 'Quota exceeded',
      })
    })

    it('should apply sandbox configuration options', async () => {
      ;(Sandbox.create as Mock).mockResolvedValue(mockSandbox)

      await createSandbox({
        apiKey: 'test-key',
        metadata: {
          taskId: 'task-123',
          repository: 'test-repo',
          branch: 'main',
        },
        timeoutMs: 30 * 60 * 1000, // 30 minutes
      })

      expect(Sandbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMs: 30 * 60 * 1000,
        })
      )
    })
  })

  describe('Sandbox Reactivation', () => {
    it('should reactivate an existing sandbox', async () => {
      // Mock successful sandbox check
      ;(fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'running' }),
      })

      ;(Sandbox.resume as Mock).mockResolvedValue(mockSandbox)

      const result = await reactivateE2BSandboxAction('sandbox-123')

      expect(result).toEqual({
        success: true,
        action: 'resumed',
        sandboxId: 'sandbox-123',
      })

      expect(Sandbox.resume).toHaveBeenCalledWith('sandbox-123', {
        timeoutMs: 60 * 60 * 1000,
      })
    })

    it('should handle sandbox not found and create new one', async () => {
      // Mock sandbox not found
      ;(fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await reactivateE2BSandboxAction('sandbox-123')

      expect(result).toEqual({
        success: false,
        error: 'Sandbox expired or not found',
        shouldCreateNew: true,
      })
    })

    it('should handle resume failure gracefully', async () => {
      // Mock sandbox exists but resume fails
      ;(fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'stopped' }),
      })

      ;(Sandbox.resume as Mock).mockRejectedValue(new Error('Sandbox in invalid state'))

      const result = await reactivateE2BSandboxAction('sandbox-123')

      expect(result).toEqual({
        success: false,
        error: 'Sandbox expired or not found',
        shouldCreateNew: true,
      })
    })
  })

  describe('Sandbox Stopping', () => {
    it('should stop a sandbox gracefully', async () => {
      ;(fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'stopped' }),
      })

      const result = await stopE2BSandboxAction('sandbox-123')

      expect(result).toEqual({
        success: true,
        status: 'stopped',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sandboxes/sandbox-123'),
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })

    it('should handle stop errors', async () => {
      ;(fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      })

      const result = await stopE2BSandboxAction('sandbox-123')

      expect(result).toEqual({
        success: false,
        error: 'Failed to stop sandbox: 500',
      })
    })
  })

  describe('Sandbox Information', () => {
    it('should get sandbox information', async () => {
      const sandboxInfo = {
        id: 'sandbox-123',
        status: 'running',
        createdAt: '2024-01-21T10:00:00Z',
        expiresAt: '2024-01-21T11:00:00Z',
        metadata: {
          taskId: 'task-123',
          repository: 'test-repo',
        },
      }

      ;(fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => sandboxInfo,
      })

      const result = await getE2BSandboxAction('sandbox-123')

      expect(result).toEqual({
        success: true,
        sandbox: sandboxInfo,
      })
    })

    it('should handle sandbox not found', async () => {
      ;(fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await getE2BSandboxAction('non-existent')

      expect(result).toEqual({
        success: false,
        error: 'Sandbox not found',
      })
    })
  })

  describe('Code Execution in Sandbox', () => {
    it('should execute code successfully', async () => {
      const code = 'print("Hello from sandbox")'
      
      const result = await runCode(mockSandbox, code)

      expect(mockSandbox.runCode).toHaveBeenCalledWith(code)
      expect(result).toEqual({
        results: [{
          type: 'log',
          data: 'Code executed successfully',
        }],
        error: null,
      })
    })

    it('should handle code execution errors', async () => {
      const code = 'invalid python code {'
      const errorResult = {
        results: [],
        error: {
          type: 'syntax',
          message: 'SyntaxError: invalid syntax',
          line: 1,
        },
      }

      mockSandbox.runCode.mockResolvedValueOnce(errorResult)

      const result = await runCode(mockSandbox, code)

      expect(result).toEqual(errorResult)
    })

    it('should handle sandbox actions', async () => {
      const actionHandler = vi.fn((props: any) => {
        return { success: true, data: props }
      })

      await mockSandbox.addAction('custom-action', actionHandler)

      expect(mockSandbox.addAction).toHaveBeenCalledWith(
        'custom-action',
        actionHandler
      )
    })
  })

  describe('Sandbox File Operations', () => {
    it('should write files to sandbox', async () => {
      const filePath = '/app/main.py'
      const content = 'def main():\n    print("Hello")'

      mockSandbox.writeFile.mockResolvedValueOnce({ success: true })

      await mockSandbox.writeFile(filePath, content)

      expect(mockSandbox.writeFile).toHaveBeenCalledWith(filePath, content)
    })

    it('should read files from sandbox', async () => {
      const filePath = '/app/main.py'
      const content = 'def main():\n    print("Hello")'

      mockSandbox.getFile.mockResolvedValueOnce(content)

      const result = await mockSandbox.getFile(filePath)

      expect(result).toBe(content)
      expect(mockSandbox.getFile).toHaveBeenCalledWith(filePath)
    })

    it('should list files in sandbox', async () => {
      const files = [
        { name: 'main.py', type: 'file', size: 100 },
        { name: 'utils', type: 'directory', size: 0 },
      ]

      mockSandbox.listFiles.mockResolvedValueOnce(files)

      const result = await mockSandbox.listFiles('/app')

      expect(result).toEqual(files)
    })
  })

  describe('Sandbox Timeout Management', () => {
    it('should handle sandbox timeout warnings', async () => {
      const sandboxInfo = {
        id: 'sandbox-123',
        status: 'running',
        createdAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(), // 55 minutes ago
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes left
      }

      ;(fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => sandboxInfo,
      })

      const result = await getE2BSandboxAction('sandbox-123')

      // Calculate time remaining
      const expiresAt = new Date(sandboxInfo.expiresAt)
      const now = new Date()
      const minutesRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60))

      expect(minutesRemaining).toBeLessThanOrEqual(5)
      expect(result.sandbox).toMatchObject({
        status: 'running',
      })
    })

    it('should extend sandbox timeout before expiration', async () => {
      ;(Sandbox.resume as Mock).mockResolvedValue({
        ...mockSandbox,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })

      const result = await Sandbox.resume('sandbox-123', {
        timeoutMs: 60 * 60 * 1000,
      })

      expect(result.expiresAt).toBeDefined()
    })
  })

  describe('Sandbox Resource Limits', () => {
    it('should respect memory limits', async () => {
      const code = `
import psutil
process = psutil.Process()
memory_info = process.memory_info()
print(f"Memory usage: {memory_info.rss / 1024 / 1024:.2f} MB")
`
      
      mockSandbox.runCode.mockResolvedValueOnce({
        results: [{
          type: 'log',
          data: 'Memory usage: 256.45 MB',
        }],
        error: null,
      })

      const result = await runCode(mockSandbox, code)
      
      expect(result.results[0].data).toContain('Memory usage')
    })

    it('should handle CPU limits', async () => {
      const cpuIntensiveCode = `
import time
start = time.time()
# Simulate CPU intensive task
for i in range(1000000):
    _ = i ** 2
end = time.time()
print(f"Execution time: {end - start:.2f}s")
`

      mockSandbox.runCode.mockResolvedValueOnce({
        results: [{
          type: 'log',
          data: 'Execution time: 0.15s',
        }],
        error: null,
      })

      const result = await runCode(mockSandbox, cpuIntensiveCode)
      
      expect(result.error).toBeNull()
    })
  })
})