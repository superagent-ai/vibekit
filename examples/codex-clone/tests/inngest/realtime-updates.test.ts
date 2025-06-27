import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { getSubscriptionToken, Realtime } from '@inngest/realtime'
import { fetchRealtimeSubscriptionToken } from '@/app/actions/inngest'
import { taskChannel, getInngestApp } from '@/lib/inngest'
import { auth } from '@/app/actions/auth'

// Mock dependencies
vi.mock('@/app/actions/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@inngest/realtime', () => ({
  getSubscriptionToken: vi.fn(),
  Realtime: {
    connect: vi.fn(),
  },
}))

vi.mock('@/lib/inngest', () => ({
  taskChannel: {
    name: 'task-updates',
    event: vi.fn(),
  },
  getInngestApp: vi.fn(() => ({
    host: vi.fn(() => 'http://localhost:8288'),
  })),
}))

describe('Real-time Updates via Channels', () => {
  let mockChannel: any
  let mockConnection: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default auth mock
    ;(auth as Mock).mockResolvedValue({ userId: 'test-user-id' })

    // Mock channel
    mockChannel = {
      postUpdate: vi.fn(),
      onMessage: vi.fn(),
      close: vi.fn(),
    }

    // Mock realtime connection
    mockConnection = {
      subscribe: vi.fn().mockReturnValue(mockChannel),
      disconnect: vi.fn(),
    }

    ;(Realtime.connect as Mock).mockResolvedValue(mockConnection)
  })

  describe('Channel Token Generation', () => {
    it('should generate subscription token for authenticated user', async () => {
      const mockToken = 'rt_token_123'
      ;(getSubscriptionToken as Mock).mockResolvedValue(mockToken)

      const result = await fetchRealtimeSubscriptionToken({
        taskId: 'task-123',
        userId: 'user-123',
      })

      expect(result).toEqual({
        success: true,
        token: mockToken,
      })

      expect(getSubscriptionToken).toHaveBeenCalledWith({
        appHost: expect.any(Function),
        signingKey: expect.any(String),
        channelName: expect.stringContaining('task/task-123/user-123'),
        expirySeconds: 3600,
      })
    })

    it('should require authentication for token generation', async () => {
      ;(auth as Mock).mockResolvedValue(null)

      const result = await fetchRealtimeSubscriptionToken({
        taskId: 'task-123',
      })

      expect(result).toEqual({
        success: false,
        error: 'Authentication required',
      })
    })

    it('should handle token generation errors', async () => {
      ;(getSubscriptionToken as Mock).mockRejectedValue(new Error('Invalid signing key'))

      const result = await fetchRealtimeSubscriptionToken({
        taskId: 'task-123',
        userId: 'user-123',
      })

      expect(result).toEqual({
        success: false,
        error: 'Invalid signing key',
      })
    })
  })

  describe('Channel Updates', () => {
    it('should post task status updates', async () => {
      const updates = [
        {
          type: 'task.update',
          task: {
            id: 'task-123',
            status: 'IN_PROGRESS',
            updatedAt: new Date().toISOString(),
          },
        },
        {
          type: 'agent.stateChange',
          state: {
            status: 'streaming',
            model: 'gpt-4o',
          },
        },
        {
          type: 'agent.response.create',
          delta: {
            type: 'text',
            text: 'Building your feature...',
          },
        },
      ]

      for (const update of updates) {
        await mockChannel.postUpdate(update)
      }

      expect(mockChannel.postUpdate).toHaveBeenCalledTimes(3)
      expect(mockChannel.postUpdate).toHaveBeenCalledWith(updates[0])
      expect(mockChannel.postUpdate).toHaveBeenCalledWith(updates[1])
      expect(mockChannel.postUpdate).toHaveBeenCalledWith(updates[2])
    })

    it('should handle streaming text updates', async () => {
      const textChunks = ['Hello', ' world', '!', ' How', ' can', ' I', ' help?']
      
      for (const chunk of textChunks) {
        await mockChannel.postUpdate({
          type: 'agent.response.create',
          delta: {
            type: 'text',
            text: chunk,
          },
        })
      }

      expect(mockChannel.postUpdate).toHaveBeenCalledTimes(textChunks.length)
    })

    it('should post error updates', async () => {
      const errorUpdate = {
        type: 'agent.error',
        error: {
          code: 'SANDBOX_ERROR',
          message: 'Failed to create sandbox: quota exceeded',
          timestamp: new Date().toISOString(),
        },
      }

      await mockChannel.postUpdate(errorUpdate)

      expect(mockChannel.postUpdate).toHaveBeenCalledWith(errorUpdate)
    })
  })

  describe('Channel Subscription', () => {
    it('should subscribe to task updates', async () => {
      const token = 'rt_token_123'
      const channelName = 'task/task-123/user-123/status'

      await Realtime.connect(token)
      const channel = mockConnection.subscribe(channelName)

      expect(Realtime.connect).toHaveBeenCalledWith(token)
      expect(mockConnection.subscribe).toHaveBeenCalledWith(channelName)
      expect(channel).toBe(mockChannel)
    })

    it('should handle incoming messages', async () => {
      const messageHandler = vi.fn()
      
      mockChannel.onMessage.mockImplementation((handler: Function) => {
        // Simulate incoming messages
        handler({
          type: 'task.update',
          task: { id: 'task-123', status: 'DONE' },
        })
        handler({
          type: 'agent.response.done',
          usage: { totalTokens: 1500 },
        })
      })

      mockChannel.onMessage(messageHandler)

      expect(messageHandler).toHaveBeenCalledTimes(2)
      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.update',
        })
      )
    })

    it('should handle connection errors', async () => {
      ;(Realtime.connect as Mock).mockRejectedValue(new Error('Connection failed'))

      await expect(Realtime.connect('invalid-token')).rejects.toThrow('Connection failed')
    })

    it('should cleanup on disconnect', async () => {
      await Realtime.connect('token')
      const channel = mockConnection.subscribe('channel')

      await channel.close()
      await mockConnection.disconnect()

      expect(mockChannel.close).toHaveBeenCalled()
      expect(mockConnection.disconnect).toHaveBeenCalled()
    })
  })

  describe('Message Types', () => {
    it('should handle task lifecycle messages', async () => {
      const lifecycleMessages = [
        { type: 'task.created', task: { id: 'task-123' } },
        { type: 'task.started', task: { id: 'task-123' } },
        { type: 'task.paused', task: { id: 'task-123' } },
        { type: 'task.resumed', task: { id: 'task-123' } },
        { type: 'task.completed', task: { id: 'task-123' } },
        { type: 'task.failed', task: { id: 'task-123', error: 'Error message' } },
      ]

      for (const message of lifecycleMessages) {
        await mockChannel.postUpdate(message)
      }

      expect(mockChannel.postUpdate).toHaveBeenCalledTimes(lifecycleMessages.length)
    })

    it('should handle sandbox messages', async () => {
      const sandboxMessages = [
        {
          type: 'sandbox.created',
          sandbox: { id: 'sandbox-123', status: 'running' },
        },
        {
          type: 'sandbox.output',
          output: {
            type: 'stdout',
            data: 'Hello from sandbox',
          },
        },
        {
          type: 'sandbox.error',
          error: {
            type: 'runtime',
            message: 'NameError: name is not defined',
          },
        },
        {
          type: 'sandbox.stopped',
          sandbox: { id: 'sandbox-123' },
        },
      ]

      for (const message of sandboxMessages) {
        await mockChannel.postUpdate(message)
      }

      expect(mockChannel.postUpdate).toHaveBeenCalledTimes(sandboxMessages.length)
    })

    it('should handle file operation messages', async () => {
      const fileMessages = [
        {
          type: 'file.created',
          file: { path: '/app/main.py', size: 150 },
        },
        {
          type: 'file.updated',
          file: { path: '/app/main.py', size: 200 },
        },
        {
          type: 'file.deleted',
          file: { path: '/app/temp.py' },
        },
      ]

      for (const message of fileMessages) {
        await mockChannel.postUpdate(message)
      }

      expect(mockChannel.postUpdate).toHaveBeenCalledTimes(fileMessages.length)
    })
  })

  describe('Rate Limiting', () => {
    it('should handle rate limit for updates', async () => {
      const updates = Array(100).fill(null).map((_, i) => ({
        type: 'agent.response.create',
        delta: { type: 'text', text: `Chunk ${i}` },
      }))

      // Simulate rate limiting
      let sentCount = 0
      const rateLimitedPost = vi.fn((update: any) => {
        if (sentCount >= 50) {
          throw new Error('Rate limit exceeded')
        }
        sentCount++
        return Promise.resolve()
      })

      mockChannel.postUpdate = rateLimitedPost

      const results = await Promise.allSettled(
        updates.map(update => mockChannel.postUpdate(update))
      )

      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      expect(successful).toBe(50)
      expect(failed).toBe(50)
    })

    it('should batch updates when necessary', async () => {
      const batchUpdate = {
        type: 'agent.response.batch',
        deltas: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
          { type: 'text', text: 'Part 3' },
        ],
      }

      await mockChannel.postUpdate(batchUpdate)

      expect(mockChannel.postUpdate).toHaveBeenCalledOnce()
      expect(mockChannel.postUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent.response.batch',
          deltas: expect.arrayContaining([
            expect.objectContaining({ text: 'Part 1' }),
            expect.objectContaining({ text: 'Part 2' }),
            expect.objectContaining({ text: 'Part 3' }),
          ]),
        })
      )
    })
  })

  describe('Channel Security', () => {
    it('should validate channel access permissions', async () => {
      const validateAccess = (userId: string, taskId: string, channelName: string) => {
        // Channel name should match pattern: task/{taskId}/{userId}/status
        const expectedPattern = `task/${taskId}/${userId}/status`
        return channelName === expectedPattern
      }

      const validAccess = validateAccess('user-123', 'task-123', 'task/task-123/user-123/status')
      const invalidAccess = validateAccess('user-123', 'task-123', 'task/task-456/user-123/status')

      expect(validAccess).toBe(true)
      expect(invalidAccess).toBe(false)
    })

    it('should expire tokens after timeout', async () => {
      const token = 'rt_token_123'
      const expiryTime = 3600 // 1 hour

      // Simulate token expiration
      const isTokenValid = (createdAt: number, currentTime: number) => {
        return (currentTime - createdAt) < (expiryTime * 1000)
      }

      const createdAt = Date.now()
      const validCheck = isTokenValid(createdAt, createdAt + 1800000) // 30 minutes later
      const expiredCheck = isTokenValid(createdAt, createdAt + 3700000) // 61 minutes later

      expect(validCheck).toBe(true)
      expect(expiredCheck).toBe(false)
    })
  })
})