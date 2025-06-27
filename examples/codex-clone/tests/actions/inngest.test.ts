import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { createTaskAction, pauseTaskAction, resumeTaskAction, cancelTaskAction } from '@/app/actions/inngest'
import { auth } from '@/app/actions/auth'
import { inngest } from '@/lib/inngest'

// Mock dependencies
vi.mock('@/app/actions/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/inngest', () => ({
  inngest: {
    send: vi.fn(),
  },
}))

// Mock Next.js cookies
vi.mock('next/cookies', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn((name: string) => ({ value: 'mock-token-value' })),
  })),
}))

// Mock global fetch
global.fetch = vi.fn()

describe('Inngest Actions', () => {
  beforeEach(() => {
    // Clear mocks properly
    if (typeof vi.clearAllMocks === 'function') {
      vi.clearAllMocks()
    } else {
      // Alternative approach if clearAllMocks is not available
      ; (auth as Mock).mockReset?.()
        ; (inngest.send as Mock).mockReset?.()
        ; (global.fetch as Mock).mockReset?.()
    }
    // Default auth mock - authenticated user
    (auth as Mock).mockResolvedValue({ userId: 'test-user-id' })
  })

  describe('createTaskAction', () => {
    const mockTask = {
      id: 'task-123',
      title: 'Test Task',
      description: 'Test Description',
      mode: 'code' as const,
      repository: 'test-repo',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'test-session',
      isArchived: false,
      hasChanges: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should create a task successfully', async () => {
      const mockEventId = 'event-123'
        ; (inngest.send as Mock).mockResolvedValue([{ id: mockEventId }])

      const result = await createTaskAction({
        task: mockTask,
        prompt: 'Build a test feature',
        sessionId: 'test-session',
        skipSandbox: true, // Skip sandbox to avoid cookies call in tests
      })

      expect(result).toEqual({
        success: true,
        eventId: mockEventId,
      })

      expect(inngest.send).toHaveBeenCalledWith({
        name: 'createTask',
        data: {
          userId: 'test-user-id',
          task: mockTask,
          prompt: 'Build a test feature',
          sessionId: 'test-session',
        },
      })
    })

    it('should require authentication', async () => {
      (auth as Mock).mockResolvedValue(null)

      const result = await createTaskAction({
        task: mockTask,
        prompt: 'Build a test feature',
        sessionId: 'test-session',
      })

      expect(result).toEqual({
        success: false,
        error: 'Authentication required',
      })

      expect(inngest.send).not.toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      (inngest.send as Mock).mockRejectedValue(new Error('Network error'))

      const result = await createTaskAction({
        task: mockTask,
        prompt: 'Build a test feature',
        sessionId: 'test-session',
        skipSandbox: true, // Skip sandbox to avoid cookies call in tests
      })

      expect(result).toEqual({
        success: false,
        error: 'Network error',
      })
    })
  })

  describe('pauseTaskAction', () => {
    it('should pause a task successfully', async () => {
      const mockRunId = 'run-123'
        ; (fetch as Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'Paused' }),
        })

      const result = await pauseTaskAction(mockRunId)

      expect(result).toEqual({
        success: true,
        status: 'Paused',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/runs/${mockRunId}/cancel`),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'X-Inngest-Signature': expect.any(String),
            'X-Inngest-Server-Kind': 'dev',
          }),
        })
      )
    })

    it('should require authentication', async () => {
      (auth as Mock).mockResolvedValue(null)

      const result = await pauseTaskAction('run-123')

      expect(result).toEqual({
        success: false,
        error: 'Authentication required',
      })

      expect(fetch).not.toHaveBeenCalled()
    })

    it('should handle API errors', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      const result = await pauseTaskAction('run-123')

      expect(result).toEqual({
        success: false,
        error: 'Failed to pause task: 500',
      })
    })
  })

  describe('resumeTaskAction', () => {
    it('should resume a task successfully', async () => {
      const mockEventId = 'event-456'
        ; (inngest.send as Mock).mockResolvedValue([{ id: mockEventId }])

      const result = await resumeTaskAction({
        taskId: 'task-123',
        runId: 'run-123',
        eventId: 'event-123',
      })

      expect(result).toEqual({
        success: true,
        eventId: mockEventId,
      })

      expect(inngest.send).toHaveBeenCalledWith({
        name: 'clonedex/resume.task',
        data: {
          userId: 'test-user-id',
          taskId: 'task-123',
          runId: 'run-123',
          eventId: 'event-123',
        },
      })
    })

    it('should handle errors gracefully', async () => {
      (inngest.send as Mock).mockRejectedValue(new Error('Failed to resume'))

      const result = await resumeTaskAction({
        taskId: 'task-123',
        runId: 'run-123',
        eventId: 'event-123',
      })

      expect(result).toEqual({
        success: false,
        error: 'Failed to resume',
      })
    })
  })

  describe('cancelTaskAction', () => {
    it('should cancel a task successfully', async () => {
      const mockRunId = 'run-123'
        ; (fetch as Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'Cancelled' }),
        })

      const result = await cancelTaskAction(mockRunId)

      expect(result).toEqual({
        success: true,
        status: 'Cancelled',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/runs/${mockRunId}/cancel`),
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })

    it('should handle cancellation of non-existent runs', async () => {
      (fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Run not found',
      })

      const result = await cancelTaskAction('non-existent-run')

      expect(result).toEqual({
        success: false,
        error: 'Failed to cancel task: 404',
      })
    })
  })
})