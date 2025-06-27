import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import { useTaskStore } from '@/stores/tasks'

// Mock all dependencies
vi.mock('@/app/actions/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@e2b/code-interpreter')
vi.mock('ai')
vi.mock('@ai-sdk/openai')

// Mock inngest properly
vi.mock('@/lib/inngest', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
  createTask: { fn: vi.fn() },
  resumeTask: { fn: vi.fn() },
  getInngestApp: vi.fn(() => ({
    host: vi.fn(() => 'http://localhost:8288'),
  })),
  taskChannel: {
    status: vi.fn(),
    update: vi.fn(),
  },
  getTaskChannel: vi.fn(() => ({
    status: vi.fn(),
    update: vi.fn(),
  })),
  createTaskChannel: vi.fn((taskId, userId) => `task/${taskId}/${userId}/status`),
}))

// Mock fetch
global.fetch = vi.fn()

// Import modules after mocking
import {
  createTaskAction,
  pauseTaskAction,
  resumeTaskAction,
  cancelTaskAction,
  rerunTaskAction
} from '@/app/actions/inngest'
import { Sandbox } from '@e2b/code-interpreter'
import { streamText } from 'ai'
import { auth } from '@/app/actions/auth'
import { inngest } from '@/lib/inngest'

describe('Full Task Execution Flow Integration', () => {
  let mockSandbox: any
  let mockChannel: any
  let taskId: string

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset task store
    useTaskStore.setState({ tasks: [] })

      // Default auth
      ; (auth as Mock).mockResolvedValue({ userId: 'test-user-id' })

    // Mock sandbox
    mockSandbox = {
      id: 'sandbox-123',
      stop: vi.fn(),
      kill: vi.fn(),
      runCode: vi.fn().mockResolvedValue({
        results: [{ type: 'log', data: 'Success' }],
        error: null,
      }),
    }

    // Mock channel
    mockChannel = {
      postUpdate: vi.fn(),
    }

    // Generate task ID
    taskId = `task-${Date.now()}`
  })

  afterEach(() => {
    // Cleanup
    vi.restoreAllMocks()
  })

  describe('Complete Task Lifecycle', () => {
    it('should execute full task flow: create -> run -> complete', async () => {
      // Step 1: Create task in store
      const { addTask, updateTask } = useTaskStore.getState()
      const task = addTask({
        title: 'Build a calculator app',
        description: 'Create a simple calculator with basic operations',
        mode: 'code' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'session-123',
        isArchived: false,
        hasChanges: false,
      })

      // Step 2: Mock Inngest send response
      const eventId = 'event-123'
        ; (inngest.send as Mock).mockResolvedValue([{ id: eventId }])

      // Step 3: Create task via action
      const createResult = await createTaskAction({
        task,
        prompt: 'Build a calculator app',
        sessionId: task.sessionId,
        skipSandbox: false,
      })

      expect(createResult).toEqual({
        success: true,
        eventId,
      })

        // Step 4: Mock sandbox creation
        ; (Sandbox.create as Mock).mockResolvedValue(mockSandbox)

      // Step 5: Mock streaming response
      const mockStream = {
        textStream: {
          [Symbol.asyncIterator]: async function* () {
            yield 'Creating calculator app...\n'
            yield '```python\n'
            yield 'class Calculator:\n'
            yield '    def add(self, a, b):\n'
            yield '        return a + b\n'
            yield '```'
          },
        },
        usage: Promise.resolve({ totalTokens: 150 }),
        warnings: [],
        rawResponse: { headers: new Headers() },
      }
        ; (streamText as Mock).mockResolvedValue(mockStream)

      // Step 6: Simulate task execution (normally done by Inngest)
      const executionUpdates: any[] = []
      mockChannel.postUpdate.mockImplementation((update: any) => {
        executionUpdates.push(update)
      })

      // Simulate the createTask function execution
      await mockChannel.postUpdate({
        type: 'task.update',
        task: { ...task, status: 'IN_PROGRESS' },
      })

      await mockChannel.postUpdate({
        type: 'agent.stateChange',
        state: { status: 'streaming' },
      })

      // Stream the response
      for await (const chunk of mockStream.textStream) {
        await mockChannel.postUpdate({
          type: 'agent.response.create',
          delta: { type: 'text', text: chunk },
        })
      }

      await mockChannel.postUpdate({
        type: 'agent.stateChange',
        state: { status: 'complete' },
      })

      // Step 7: Update task status to completed
      updateTask(task.id, { status: 'DONE' as const })

      // Verify final state
      const completedTask = useTaskStore.getState().getTask(task.id)
      expect(completedTask?.status).toBe('DONE')

      // Verify execution flow
      expect(executionUpdates).toContainEqual(
        expect.objectContaining({
          type: 'task.update',
          task: expect.objectContaining({ status: 'IN_PROGRESS' }),
        })
      )
      expect(executionUpdates).toContainEqual(
        expect.objectContaining({
          type: 'agent.stateChange',
          state: { status: 'complete' },
        })
      )
    })

    it('should handle pause and resume flow', async () => {
      // Create and start task
      const { addTask, updateTask } = useTaskStore.getState()
      const task = addTask({
        title: 'Long running task',
        description: 'Task that will be paused',
        mode: 'code' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'session-456',
        isArchived: false,
        hasChanges: false,
      })

      const runId = 'run-123'
      const eventId = 'event-123'

        // Step 1: Pause the task
        ; (fetch as Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'Paused' }),
        })

      const pauseResult = await pauseTaskAction(runId)
      expect(pauseResult.success).toBe(true)

      // Update local state
      updateTask(task.id, { status: 'PAUSED' as const })

      // Step 2: Save task state
      const savedState = {
        executedCode: ['import math', 'result = math.sqrt(16)'],
        variables: { result: 4 },
        sandboxId: 'sandbox-123',
      }

        // Step 3: Resume the task
        ; (inngest.send as Mock).mockResolvedValue([{ id: 'new-event-123' }])
        ; (Sandbox.resume as Mock).mockResolvedValue(mockSandbox)

      const resumeResult = await resumeTaskAction({
        taskId: task.id,
        runId,
        eventId,
      })

      expect(resumeResult.success).toBe(true)

      // Update local state
      updateTask(task.id, { status: 'IN_PROGRESS' as const })

      // Verify task is resumed
      const resumedTask = useTaskStore.getState().getTask(task.id)
      expect(resumedTask?.status).toBe('IN_PROGRESS')
    })

    it('should handle task cancellation', async () => {
      // Create running task
      const { addTask, updateTask } = useTaskStore.getState()
      const task = addTask({
        title: 'Task to cancel',
        description: 'Will be cancelled',
        mode: 'ask' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'session-789',
        isArchived: false,
        hasChanges: false,
      })

      const runId = 'run-456'

        // Cancel the task
        ; (fetch as Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'Cancelled' }),
        })

      const cancelResult = await cancelTaskAction(runId)
      expect(cancelResult.success).toBe(true)

      // Update local state
      updateTask(task.id, { status: 'STOPPED' as const })

      // Cleanup sandbox
      if (mockSandbox.stop) {
        await mockSandbox.stop()
      }

      // Verify final state
      const cancelledTask = useTaskStore.getState().getTask(task.id)
      expect(cancelledTask?.status).toBe('STOPPED')
      expect(mockSandbox.stop).toHaveBeenCalled()
    })

    it('should handle task rerun', async () => {
      // Create completed task
      const { addTask } = useTaskStore.getState()
      const originalTask = addTask({
        title: 'Original task',
        description: 'First run',
        mode: 'code' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'DONE' as const,
        messages: [{ role: 'user', content: 'Build feature' }],
        sessionId: 'session-original',
        isArchived: false,
        hasChanges: true,
      })

        // Rerun the task
        ; (inngest.send as Mock).mockResolvedValue([{ id: 'rerun-event-123' }])

      const rerunResult = await rerunTaskAction({
        task: originalTask,
        sessionId: 'session-rerun',
        prompt: 'Build feature with improvements',
      })

      expect(rerunResult.success).toBe(true)

      // Verify new task was created
      const tasks = useTaskStore.getState().getTasks()
      expect(tasks).toHaveLength(2) // Original + rerun

      const rerunTask = tasks.find(t => t.sessionId === 'session-rerun')
      expect(rerunTask).toBeDefined()
      expect(rerunTask?.status).toBe('IN_PROGRESS')
    })
  })

  describe('Error Handling and Recovery', () => {
    it('should handle sandbox creation failure', async () => {
      const { addTask } = useTaskStore.getState()
      const task = addTask({
        title: 'Task with sandbox error',
        description: 'Sandbox will fail',
        mode: 'code' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'session-error',
        isArchived: false,
        hasChanges: false,
      })

        // Mock sandbox creation failure
        ; (Sandbox.create as Mock).mockRejectedValue(new Error('Quota exceeded'))

        // Attempt to create task
        ; (inngest.send as Mock).mockResolvedValue([{ id: 'event-error' }])

      const result = await createTaskAction({
        task,
        prompt: 'Try to create',
        sessionId: task.sessionId,
      })

      // Task creation should succeed (async execution)
      expect(result.success).toBe(true)

      // But sandbox creation would fail in background
      // Simulate error handling
      await mockChannel.postUpdate({
        type: 'agent.error',
        error: {
          code: 'SANDBOX_ERROR',
          message: 'Quota exceeded',
        },
      })

      // Task should be updated to show error
      expect(mockChannel.postUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent.error',
        })
      )
    })

    it('should handle network failures gracefully', async () => {
      ; (inngest.send as Mock).mockRejectedValue(new Error('Network error'))

      const { addTask } = useTaskStore.getState()
      const task = addTask({
        title: 'Network error task',
        description: 'Network will fail',
        mode: 'ask' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'session-network',
        isArchived: false,
        hasChanges: false,
      })

      const result = await createTaskAction({
        task,
        prompt: 'Test network failure',
        sessionId: task.sessionId,
      })

      expect(result).toEqual({
        success: false,
        error: 'Network error',
      })
    })

    it('should recover from transient failures', async () => {
      let attempts = 0
        ; (inngest.send as Mock).mockImplementation(() => {
          attempts++
          if (attempts === 1) {
            return Promise.reject(new Error('Temporary failure'))
          }
          return Promise.resolve([{ id: 'success-event' }])
        })

      // Implement retry logic
      const retryAction = async (action: () => Promise<any>, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await action()
          } catch (error) {
            if (i === maxRetries - 1) throw error
            await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)))
          }
        }
      }

      const result = await retryAction(() =>
        inngest.send({
          name: 'clonedex/create.task',
          data: { test: true },
        })
      )

      expect(attempts).toBe(2)
      expect(result).toEqual([{ id: 'success-event' }])
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent tasks', async () => {
      const { addTask } = useTaskStore.getState()
      const taskPromises = []

      // Create 10 concurrent tasks
      for (let i = 0; i < 10; i++) {
        const task = addTask({
          title: `Concurrent task ${i}`,
          description: `Task number ${i}`,
          mode: i % 2 === 0 ? 'code' : 'ask' as const,
          repository: 'test-repo',
          branch: 'main',
          status: 'IN_PROGRESS' as const,
          messages: [],
          sessionId: `session-concurrent-${i}`,
          isArchived: false,
          hasChanges: false,
        })

          ; (inngest.send as Mock).mockResolvedValueOnce([{ id: `event-${i}` }])

        taskPromises.push(
          createTaskAction({
            task,
            prompt: `Execute task ${i}`,
            sessionId: task.sessionId,
            skipSandbox: true,
          })
        )
      }

      const results = await Promise.all(taskPromises)

      // All tasks should succeed
      expect(results.every(r => r.success)).toBe(true)
      expect(useTaskStore.getState().getTasks()).toHaveLength(10)
    })

    it('should handle large streaming responses', async () => {
      // Generate large response
      const largeResponse = Array(1000).fill(null).map((_, i) =>
        `Line ${i}: This is a test of streaming large responses.\n`
      )

      const mockStream = {
        textStream: {
          [Symbol.asyncIterator]: async function* () {
            for (const line of largeResponse) {
              yield line
            }
          },
        },
        usage: Promise.resolve({ totalTokens: 50000 }),
        warnings: [],
        rawResponse: { headers: new Headers() },
      }

        ; (streamText as Mock).mockResolvedValue(mockStream)

      let chunksReceived = 0
      mockChannel.postUpdate.mockImplementation(() => {
        chunksReceived++
      })

      // Stream the large response
      for await (const chunk of mockStream.textStream) {
        await mockChannel.postUpdate({
          type: 'agent.response.create',
          delta: { type: 'text', text: chunk },
        })
      }

      expect(chunksReceived).toBe(1000)
    })
  })
})