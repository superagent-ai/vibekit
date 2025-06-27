import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { inngest } from '@/lib/inngest'
import { createTask } from '@/app/api/inngest/functions/createTask'
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

// Mock dependencies
vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => ({
    model: 'gpt-4o',
  })),
}))

vi.mock('ai', () => ({
  streamText: vi.fn(),
}))

vi.mock('@/app/api/inngest/functions/sandbox', () => ({
  createSandbox: vi.fn(),
  runCode: vi.fn(),
}))

describe('createTask Inngest Function', () => {
  let mockStep: any
  let mockEvent: any
  let mockChannel: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock channel
    mockChannel = {
      postUpdate: vi.fn(),
    }

    // Mock step functions
    mockStep = {
      run: vi.fn((name: string, fn: () => any) => fn()),
      sendEvent: vi.fn(),
      waitForEvent: vi.fn(),
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
        },
        prompt: 'Build a test feature',
        sessionId: 'test-session',
      },
    }
  })

  it('should handle code mode tasks', async () => {
    // Mock stream response
    const mockStream = {
      textStream: {
        [Symbol.asyncIterator]: async function* () {
          yield 'Building'
          yield ' the'
          yield ' feature...'
        },
      },
      usage: Promise.resolve({ totalTokens: 100 }),
      warnings: [],
      rawResponse: { headers: new Headers() },
    }
    ;(streamText as Mock).mockResolvedValue(mockStream)

    // Mock task execution steps
    mockStep.run.mockImplementation((name: string, fn: () => any) => {
      if (name === 'get-subscription-token') {
        return { token: 'test-token' }
      }
      if (name === 'create-channel') {
        return mockChannel
      }
      if (name === 'setup-sandbox') {
        return { 
          sandbox: { id: 'sandbox-123' },
          metadata: { sandboxId: 'sandbox-123' }
        }
      }
      if (name === 'initial-task-update') {
        return undefined
      }
      if (name === 'stream-response') {
        return fn()
      }
      return fn()
    })

    // Execute the function
    const result = await createTask.fn({ event: mockEvent, step: mockStep })

    // Verify channel updates were posted
    expect(mockChannel.postUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.stateChange',
        state: expect.objectContaining({
          status: 'streaming',
        }),
      })
    )

    // Verify stream was called with correct parameters
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(Object),
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('software engineer'),
          }),
          expect.objectContaining({
            role: 'user',
            content: 'Build a test feature',
          }),
        ]),
        temperature: 0.1,
        maxTokens: 100000,
      })
    )
  })

  it('should handle ask mode tasks', async () => {
    mockEvent.data.task.mode = 'ask'

    const mockStream = {
      textStream: {
        [Symbol.asyncIterator]: async function* () {
          yield 'Here is'
          yield ' the answer'
        },
      },
      usage: Promise.resolve({ totalTokens: 50 }),
      warnings: [],
      rawResponse: { headers: new Headers() },
    }
    ;(streamText as Mock).mockResolvedValue(mockStream)

    mockStep.run.mockImplementation((name: string, fn: () => any) => {
      if (name === 'get-subscription-token') {
        return { token: 'test-token' }
      }
      if (name === 'create-channel') {
        return mockChannel
      }
      if (name === 'initial-task-update') {
        return undefined
      }
      if (name === 'stream-response') {
        return fn()
      }
      return fn()
    })

    await createTask.fn({ event: mockEvent, step: mockStep })

    // Verify no sandbox was created for ask mode
    expect(mockStep.run).not.toHaveBeenCalledWith(
      'setup-sandbox',
      expect.any(Function)
    )

    // Verify stream was called with ask mode system prompt
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('technical assistant'),
          }),
        ]),
      })
    )
  })

  it('should handle errors gracefully', async () => {
    const testError = new Error('Stream failed')
    ;(streamText as Mock).mockRejectedValue(testError)

    mockStep.run.mockImplementation((name: string, fn: () => any) => {
      if (name === 'get-subscription-token') {
        return { token: 'test-token' }
      }
      if (name === 'create-channel') {
        return mockChannel
      }
      if (name === 'setup-sandbox') {
        return { 
          sandbox: { id: 'sandbox-123' },
          metadata: { sandboxId: 'sandbox-123' }
        }
      }
      if (name === 'initial-task-update') {
        return undefined
      }
      if (name === 'stream-response') {
        return fn()
      }
      if (name === 'final-update') {
        return fn()
      }
      return fn()
    })

    await expect(createTask.fn({ event: mockEvent, step: mockStep })).rejects.toThrow('Stream failed')

    // Verify error update was posted
    expect(mockChannel.postUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.error',
        error: expect.objectContaining({
          message: 'Stream failed',
        }),
      })
    )
  })

  it('should update task status throughout execution', async () => {
    const mockStream = {
      textStream: {
        [Symbol.asyncIterator]: async function* () {
          yield 'Processing...'
        },
      },
      usage: Promise.resolve({ totalTokens: 10 }),
      warnings: [],
      rawResponse: { headers: new Headers() },
    }
    ;(streamText as Mock).mockResolvedValue(mockStream)

    mockStep.run.mockImplementation((name: string, fn: () => any) => {
      if (name === 'get-subscription-token') {
        return { token: 'test-token' }
      }
      if (name === 'create-channel') {
        return mockChannel
      }
      if (name === 'setup-sandbox') {
        return { 
          sandbox: { id: 'sandbox-123' },
          metadata: { sandboxId: 'sandbox-123' }
        }
      }
      if (name === 'initial-task-update') {
        return fn()
      }
      if (name === 'stream-response') {
        return fn()
      }
      if (name === 'final-update') {
        return fn()
      }
      return fn()
    })

    await createTask.fn({ event: mockEvent, step: mockStep })

    // Verify initial update
    const initialUpdate = mockChannel.postUpdate.mock.calls.find(
      (call: any[]) => call[0].type === 'task.update'
    )
    expect(initialUpdate).toBeDefined()
    expect(initialUpdate[0].task.status).toBe('IN_PROGRESS')

    // Verify streaming state
    const streamingUpdate = mockChannel.postUpdate.mock.calls.find(
      (call: any[]) => call[0].type === 'agent.stateChange' && call[0].state.status === 'streaming'
    )
    expect(streamingUpdate).toBeDefined()

    // Verify completion
    const completeUpdate = mockChannel.postUpdate.mock.calls.find(
      (call: any[]) => call[0].type === 'agent.stateChange' && call[0].state.status === 'complete'
    )
    expect(completeUpdate).toBeDefined()
  })
})