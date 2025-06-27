import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomePageChatInterface } from '@/lib/components/chat-interface/examples/HomePageExample'
import { useTaskStore } from '@/stores/tasks'
import { createTaskAction } from '@/app/actions/inngest'
import { useRouter } from 'next/navigation'

// Mock dependencies
vi.mock('@/app/actions/inngest', () => ({
  createTaskAction: vi.fn(),
}))

vi.mock('@/stores/repository', () => ({
  useRepositoryStore: () => ({
    repository: 'test-repo',
    branch: 'main',
    setRepository: vi.fn(),
    setBranch: vi.fn(),
  }),
}))

describe('Task Creation Flow Integration', () => {
  const mockPush = vi.fn()
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.clearAllMocks()
    user = userEvent.setup()
    
    // Reset task store
    useTaskStore.setState({
      tasks: [],
      notifications: true,
    })

    // Setup router mock
    ;(useRouter as Mock).mockReturnValue({
      push: mockPush,
    })

    // Default success response
    ;(createTaskAction as Mock).mockResolvedValue({
      success: true,
      eventId: 'event-123',
    })
  })

  it('should complete full task creation flow', async () => {
    render(<HomePageChatInterface />)

    // Find and fill the input
    const input = screen.getByPlaceholderText('What would you like to build?')
    await user.type(input, 'Build a new feature')

    // Submit the form (Enter key)
    await user.keyboard('{Enter}')

    // Wait for task creation
    await waitFor(() => {
      expect(createTaskAction).toHaveBeenCalled()
    })

    // Verify task was added to store
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      title: 'Build a new feature',
      description: 'Build a new feature',
      mode: 'ask', // Default mode
      repository: 'test-repo',
      branch: 'main',
      status: 'IN_PROGRESS',
    })

    // Verify navigation to task page
    expect(mockPush).toHaveBeenCalledWith(`/task/${tasks[0].id}`)

    // Verify backend action was called
    expect(createTaskAction).toHaveBeenCalledWith({
      task: expect.objectContaining({
        title: 'Build a new feature',
        repository: 'test-repo',
      }),
      prompt: 'Build a new feature',
      sessionId: expect.any(String),
    })
  })

  it('should handle mode selection', async () => {
    render(<HomePageChatInterface />)

    // Click on mode selector to switch to code mode
    const modeButton = screen.getByRole('button', { name: /mode/i })
    await user.click(modeButton)

    // Select code mode
    const codeOption = screen.getByText(/code/i)
    await user.click(codeOption)

    // Create task
    const input = screen.getByPlaceholderText('What would you like to build?')
    await user.type(input, 'Write unit tests')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      const tasks = useTaskStore.getState().tasks
      expect(tasks[0].mode).toBe('code')
    })
  })

  it('should prevent task creation without repository', async () => {
    // Mock no repository selected
    vi.mock('@/stores/repository', () => ({
      useRepositoryStore: () => ({
        repository: null,
        branch: null,
        setRepository: vi.fn(),
        setBranch: vi.fn(),
      }),
    }))

    render(<HomePageChatInterface />)

    const input = screen.getByPlaceholderText('What would you like to build?')
    await user.type(input, 'Build something')
    await user.keyboard('{Enter}')

    // Should not create task
    expect(createTaskAction).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/select a repository/i)).toBeInTheDocument()
    })
  })

  it('should handle backend errors gracefully', async () => {
    ;(createTaskAction as Mock).mockResolvedValue({
      success: false,
      error: 'Failed to create task',
    })

    render(<HomePageChatInterface />)

    const input = screen.getByPlaceholderText('What would you like to build?')
    await user.type(input, 'Build feature')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(createTaskAction).toHaveBeenCalled()
    })

    // Task should still be created locally
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(1)

    // Should navigate to task page despite backend error
    expect(mockPush).toHaveBeenCalled()
  })

  it('should handle multi-line input', async () => {
    render(<HomePageChatInterface />)

    const input = screen.getByPlaceholderText('What would you like to build?')
    
    // Type multi-line message
    await user.type(input, 'Build a feature that:{Shift>}{Enter}{/Shift}')
    await user.type(input, '- Does X{Shift>}{Enter}{/Shift}')
    await user.type(input, '- Does Y')
    
    // Submit with Enter (without Shift)
    await user.keyboard('{Enter}')

    await waitFor(() => {
      const tasks = useTaskStore.getState().tasks
      expect(tasks[0].title).toContain('Build a feature that:')
      expect(tasks[0].title).toContain('- Does X')
      expect(tasks[0].title).toContain('- Does Y')
    })
  })

  it('should clear input after submission', async () => {
    render(<HomePageChatInterface />)

    const input = screen.getByPlaceholderText('What would you like to build?') as HTMLTextAreaElement
    await user.type(input, 'Test message')
    
    expect(input.value).toBe('Test message')

    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(input.value).toBe('')
    })
  })

  it('should handle rapid submissions', async () => {
    render(<HomePageChatInterface />)

    const input = screen.getByPlaceholderText('What would you like to build?')
    
    // First submission
    await user.type(input, 'First task')
    await user.keyboard('{Enter}')

    // Immediate second submission
    await user.type(input, 'Second task')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(createTaskAction).toHaveBeenCalledTimes(2)
      const tasks = useTaskStore.getState().tasks
      expect(tasks).toHaveLength(2)
    })
  })

  it('should persist tasks across page reloads', async () => {
    // Create a task
    const { addTask } = useTaskStore.getState()
    const task = addTask({
      title: 'Persistent Task',
      description: 'Should survive reload',
      mode: 'code' as const,
      repository: 'test-repo',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'test-session',
      isArchived: false,
      hasChanges: false,
    })

    // Simulate localStorage persistence
    const storedData = localStorage.getItem('tasks-storage')
    expect(storedData).toBeTruthy()

    // Clear store (simulate page reload)
    useTaskStore.setState({ tasks: [] })

    // Restore from localStorage
    if (storedData) {
      const parsed = JSON.parse(storedData)
      useTaskStore.setState(parsed.state)
    }

    // Verify task was restored
    const restoredTasks = useTaskStore.getState().tasks
    expect(restoredTasks).toHaveLength(1)
    expect(restoredTasks[0].id).toBe(task.id)
  })
})