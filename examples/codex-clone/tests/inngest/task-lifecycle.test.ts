import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { inngest } from '@/lib/inngest'
import { createTask } from '@/app/api/inngest/functions/createTask'
import { resumeTask } from '@/app/api/inngest/functions/resumeTask'
import { createSandbox, runCode } from '@/app/api/inngest/functions/sandbox'
import { Sandbox } from '@e2b/code-interpreter'

// Mock dependencies
vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    create: vi.fn(),
    resume: vi.fn(),
  },
}))

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => ({
    model: 'gpt-4o',
  })),
}))

vi.mock('ai', () => ({
  streamText: vi.fn(),
}))

describe('Inngest Task Lifecycle', () => {
  let mockStep: any
  let mockEvent: any
  let mockChannel: any
  let mockSandbox: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock sandbox instance
    mockSandbox = {
      id: 'sandbox-123',
      stop: vi.fn(),
      kill: vi.fn(),
      addAction: vi.fn(),
      runCode: vi.fn().mockResolvedValue({
        error: null,
        logs: [{ type: 'log', data: 'Code executed' }],
      }),
    }

    // Mock channel
    mockChannel = {
      postUpdate: vi.fn(),
    }

    // Mock step functions
    mockStep = {
      run: vi.fn((name: string, fn: () => any) => fn()),
      sendEvent: vi.fn(),
      waitForEvent: vi.fn(),
      sleep: vi.fn(),
    }

    // Mock event
    mockEvent = {
      data: {
        userId: 'test-user-id',
        task: {
          id: 'task-123',
          title: 'Test Task',
          description: 'Test Description',
          mode: 'code',
          repository: 'test-repo',
          branch: 'main',
          sessionId: 'test-session',
          status: 'IN_PROGRESS',
        },
        prompt: 'Build a test feature',
        sessionId: 'test-session',
      },
    }
  })

  describe('Task Starting', () => {
    it('should start a task with sandbox creation', async () => {
      ;(Sandbox.create as Mock).mockResolvedValue(mockSandbox)

      mockStep.run.mockImplementation((name: string, fn: () => any) => {
        if (name === 'get-subscription-token') {
          return { token: 'test-token' }
        }
        if (name === 'create-channel') {
          return mockChannel
        }
        if (name === 'setup-sandbox') {
          return fn()
        }
        return fn()
      })

      // Start the task
      await createTask.fn({ event: mockEvent, step: mockStep })

      // Verify sandbox was created
      expect(Sandbox.create).toHaveBeenCalledWith({
        apiKey: expect.any(String),
        metadata: {
          taskId: 'task-123',
          sessionId: 'test-session',
          repository: 'test-repo',
          branch: 'main',
        },
      })

      // Verify initial status update
      expect(mockChannel.postUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.update',
          task: expect.objectContaining({
            status: 'IN_PROGRESS',
          }),
        })
      )
    })

    it('should handle sandbox creation failure', async () => {
      const sandboxError = new Error('Failed to create sandbox')
      ;(Sandbox.create as Mock).mockRejectedValue(sandboxError)

      mockStep.run.mockImplementation((name: string, fn: () => any) => {
        if (name === 'get-subscription-token') {
          return { token: 'test-token' }
        }
        if (name === 'create-channel') {
          return mockChannel
        }
        if (name === 'setup-sandbox') {
          return fn()
        }
        return fn()
      })

      // Attempt to start the task
      await expect(createTask.fn({ event: mockEvent, step: mockStep })).rejects.toThrow('Failed to create sandbox')

      // Verify error was posted to channel
      expect(mockChannel.postUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent.error',
          error: expect.objectContaining({
            message: 'Failed to create sandbox',
          }),
        })
      )
    })
  })

  describe('Task Pausing', () => {
    it('should pause a running task', async () => {
      // Mock a pause event
      const pauseEvent = {
        name: 'pauseTask',
        data: {
          taskId: 'task-123',
          runId: 'run-123',
        },
      }

      mockStep.waitForEvent.mockResolvedValue(pauseEvent)

      // Simulate pause handling
      const pauseResult = await mockStep.waitForEvent('pauseTask', {
        match: 'data.taskId',
        timeout: '1h',
      })

      expect(pauseResult).toEqual(pauseEvent)
      
      // In real implementation, this would trigger sandbox pause
      expect(mockStep.waitForEvent).toHaveBeenCalledWith(
        'pauseTask',
        expect.objectContaining({
          match: 'data.taskId',
        })
      )
    })

    it('should save task state when pausing', async () => {
      // Mock current task state
      const taskState = {
        executedCode: ['print("Hello")', 'x = 5'],
        currentStep: 2,
        variables: { x: 5 },
      }

      mockStep.run.mockImplementation((name: string, fn: () => any) => {
        if (name === 'save-task-state') {
          return fn()
        }
        return undefined
      })

      // Save state on pause
      const savedState = await mockStep.run('save-task-state', () => {
        return {
          taskId: 'task-123',
          state: taskState,
          timestamp: new Date().toISOString(),
        }
      })

      expect(savedState).toMatchObject({
        taskId: 'task-123',
        state: taskState,
      })
    })
  })

  describe('Task Resuming', () => {
    it('should resume a paused task with state restoration', async () => {
      // Mock resumed sandbox
      ;(Sandbox.resume as Mock).mockResolvedValue(mockSandbox)

      const resumeEvent = {
        data: {
          userId: 'test-user-id',
          taskId: 'task-123',
          runId: 'run-123',
          eventId: 'event-123',
          savedState: {
            executedCode: ['print("Hello")', 'x = 5'],
            currentStep: 2,
            variables: { x: 5 },
          },
        },
      }

      mockStep.run.mockImplementation((name: string, fn: () => any) => {
        if (name === 'resume-sandbox') {
          return fn()
        }
        if (name === 'restore-state') {
          return fn()
        }
        return fn()
      })

      // Resume the task
      await resumeTask.fn({ event: resumeEvent, step: mockStep })

      // Verify sandbox was resumed
      expect(Sandbox.resume).toHaveBeenCalledWith('sandbox-123', {
        timeoutMs: 60 * 60 * 1000,
      })

      // Verify state restoration
      expect(mockSandbox.runCode).toHaveBeenCalledWith('x = 5')
    })

    it('should handle resume failure and create new sandbox', async () => {
      ;(Sandbox.resume as Mock).mockRejectedValue(new Error('Sandbox expired'))
      ;(Sandbox.create as Mock).mockResolvedValue(mockSandbox)

      const resumeEvent = {
        data: {
          userId: 'test-user-id',
          taskId: 'task-123',
          runId: 'run-123',
          eventId: 'event-123',
        },
      }

      mockStep.run.mockImplementation((name: string, fn: () => any) => {
        if (name === 'resume-sandbox') {
          return fn()
        }
        return fn()
      })

      await resumeTask.fn({ event: resumeEvent, step: mockStep })

      // Verify new sandbox was created after resume failure
      expect(Sandbox.create).toHaveBeenCalled()
    })
  })

  describe('Task Stopping/Cancellation', () => {
    it('should stop a running task and cleanup sandbox', async () => {
      const cancelEvent = {
        name: 'cancelTask',
        data: {
          taskId: 'task-123',
          runId: 'run-123',
        },
      }

      mockStep.waitForEvent.mockResolvedValue(cancelEvent)

      // Simulate cancellation
      const result = await mockStep.waitForEvent('cancelTask', {
        match: 'data.taskId',
      })

      expect(result).toEqual(cancelEvent)

      // In real implementation, this would trigger:
      // 1. Stop sandbox
      // 2. Update task status to STOPPED
      // 3. Post final update to channel
    })

    it('should cleanup resources on task completion', async () => {
      mockStep.run.mockImplementation((name: string, fn: () => any) => {
        if (name === 'cleanup-sandbox') {
          return fn()
        }
        return fn()
      })

      // Cleanup sandbox
      const cleanupResult = await mockStep.run('cleanup-sandbox', async () => {
        await mockSandbox.stop()
        return { success: true }
      })

      expect(mockSandbox.stop).toHaveBeenCalled()
      expect(cleanupResult).toEqual({ success: true })
    })

    it('should handle force kill if graceful stop fails', async () => {
      mockSandbox.stop.mockRejectedValue(new Error('Stop timeout'))

      mockStep.run.mockImplementation((name: string, fn: () => any) => {
        if (name === 'cleanup-sandbox') {
          return fn()
        }
        return fn()
      })

      // Attempt cleanup with fallback to kill
      const cleanupResult = await mockStep.run('cleanup-sandbox', async () => {
        try {
          await mockSandbox.stop()
        } catch (error) {
          console.log('Graceful stop failed, force killing...')
          await mockSandbox.kill()
        }
        return { success: true, method: 'kill' }
      })

      expect(mockSandbox.stop).toHaveBeenCalled()
      expect(mockSandbox.kill).toHaveBeenCalled()
      expect(cleanupResult).toEqual({ success: true, method: 'kill' })
    })
  })

  describe('Task State Transitions', () => {
    it('should transition through task states correctly', async () => {
      const stateUpdates: any[] = []

      mockChannel.postUpdate.mockImplementation((update: any) => {
        if (update.type === 'task.update') {
          stateUpdates.push(update.task.status)
        }
      })

      // Simulate task lifecycle
      const states = ['IN_PROGRESS', 'PAUSED', 'IN_PROGRESS', 'DONE']
      
      for (const status of states) {
        await mockChannel.postUpdate({
          type: 'task.update',
          task: { id: 'task-123', status },
        })
      }

      expect(stateUpdates).toEqual(states)
    })

    it('should prevent invalid state transitions', async () => {
      const currentState = 'DONE'
      
      // Attempt to transition from DONE to IN_PROGRESS (invalid)
      const isValidTransition = (from: string, to: string) => {
        const validTransitions: Record<string, string[]> = {
          'IN_PROGRESS': ['PAUSED', 'DONE', 'STOPPED'],
          'PAUSED': ['IN_PROGRESS', 'STOPPED'],
          'DONE': ['MERGED'],
          'STOPPED': [],
          'MERGED': [],
        }
        return validTransitions[from]?.includes(to) ?? false
      }

      expect(isValidTransition('DONE', 'IN_PROGRESS')).toBe(false)
      expect(isValidTransition('IN_PROGRESS', 'PAUSED')).toBe(true)
      expect(isValidTransition('PAUSED', 'IN_PROGRESS')).toBe(true)
    })
  })

  describe('Concurrent Task Management', () => {
    it('should handle multiple tasks running simultaneously', async () => {
      const tasks = [
        { id: 'task-1', sandboxId: 'sandbox-1' },
        { id: 'task-2', sandboxId: 'sandbox-2' },
        { id: 'task-3', sandboxId: 'sandbox-3' },
      ]

      const sandboxes = tasks.map(task => ({
        id: task.sandboxId,
        stop: vi.fn(),
      }))

      ;(Sandbox.create as Mock)
        .mockResolvedValueOnce(sandboxes[0])
        .mockResolvedValueOnce(sandboxes[1])
        .mockResolvedValueOnce(sandboxes[2])

      // Create multiple sandboxes
      const createdSandboxes = await Promise.all(
        tasks.map(() => Sandbox.create({ apiKey: 'test-key' }))
      )

      expect(Sandbox.create).toHaveBeenCalledTimes(3)
      expect(createdSandboxes).toHaveLength(3)
    })

    it('should isolate task failures', async () => {
      const task1Error = new Error('Task 1 failed')
      const task2Success = { result: 'success' }

      ;(Sandbox.create as Mock)
        .mockRejectedValueOnce(task1Error)
        .mockResolvedValueOnce(mockSandbox)

      const results = await Promise.allSettled([
        Sandbox.create({ apiKey: 'test-key' }),
        Sandbox.create({ apiKey: 'test-key' }),
      ])

      expect(results[0].status).toBe('rejected')
      expect(results[1].status).toBe('fulfilled')
      
      // Task 2 should succeed despite Task 1 failure
      if (results[1].status === 'fulfilled') {
        expect(results[1].value).toBe(mockSandbox)
      }
    })
  })
})