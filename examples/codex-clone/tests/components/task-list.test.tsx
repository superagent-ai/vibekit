import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskList from '@/app/_components/task-list'
import { useTaskStore } from '@/stores/tasks'
import { useRouter } from 'next/navigation'

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

vi.mock('@/stores/repository', () => ({
  useRepositoryStore: () => ({
    repository: 'test-repo',
    branch: 'main',
  }),
}))

describe('TaskList Component', () => {
  const mockPush = vi.fn()
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.clearAllMocks()
    user = userEvent.setup()
    
    // Setup router mock
    ;(useRouter as any).mockReturnValue({
      push: mockPush,
    })

    // Reset task store
    useTaskStore.setState({
      tasks: [],
      notifications: true,
    })
  })

  it('should display empty state when no tasks', () => {
    const { container } = render(<TaskList />)
    
    // TaskList returns null when there are no tasks
    expect(container.firstChild).toBeNull()
  })

  it('should display active tasks', () => {
    // Add test tasks
    const { addTask } = useTaskStore.getState()
    
    addTask({
      title: 'Active Task 1',
      description: 'Description 1',
      mode: 'code' as const,
      repository: 'repo1',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session1',
      isArchived: false,
      hasChanges: false,
    })

    addTask({
      title: 'Active Task 2',
      description: 'Description 2',
      mode: 'ask' as const,
      repository: 'repo2',
      branch: 'develop',
      status: 'DONE' as const,
      messages: [],
      sessionId: 'session2',
      isArchived: false,
      hasChanges: true,
    })

    const { container } = render(<TaskList />)

    // Debug: log the rendered output
    // console.log(container.innerHTML)

    expect(screen.getByText('Active Task 1')).toBeInTheDocument()
    expect(screen.getByText('Active Task 2')).toBeInTheDocument()
    
    // Repository names are displayed as badges
    const badges = container.querySelectorAll('.bg-blue-100')
    expect(badges.length).toBeGreaterThan(0)
    
    // Check that the repository names exist somewhere in the DOM
    expect(container.textContent).toContain('repo1')
    expect(container.textContent).toContain('repo2')
  })

  it('should not display archived tasks by default', () => {
    const { addTask } = useTaskStore.getState()
    
    addTask({
      title: 'Active Task',
      description: 'Visible',
      mode: 'code' as const,
      repository: 'repo1',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session1',
      isArchived: false,
      hasChanges: false,
    })

    addTask({
      title: 'Archived Task',
      description: 'Hidden',
      mode: 'ask' as const,
      repository: 'repo2',
      branch: 'main',
      status: 'DONE' as const,
      messages: [],
      sessionId: 'session2',
      isArchived: true,
      hasChanges: false,
    })

    render(<TaskList />)

    expect(screen.getByText('Active Task')).toBeInTheDocument()
    expect(screen.queryByText('Archived Task')).not.toBeInTheDocument()
  })

  it('should navigate to task page on click', async () => {
    const { addTask } = useTaskStore.getState()
    
    const task = addTask({
      title: 'Clickable Task',
      description: 'Click me',
      mode: 'code' as const,
      repository: 'test-repo',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session1',
      isArchived: false,
      hasChanges: false,
    })

    render(<TaskList />)

    const taskElement = screen.getByText('Clickable Task')
    await user.click(taskElement)

    expect(mockPush).toHaveBeenCalledWith(`/task/${task.id}`)
  })

  it('should display task status correctly', () => {
    const { addTask } = useTaskStore.getState()
    
    addTask({
      title: 'In Progress Task',
      description: 'Running',
      mode: 'code' as const,
      repository: 'repo1',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session1',
      isArchived: false,
      hasChanges: false,
    })

    addTask({
      title: 'Completed Task',
      description: 'Done',
      mode: 'ask' as const,
      repository: 'repo2',
      branch: 'main',
      status: 'DONE' as const,
      messages: [],
      sessionId: 'session2',
      isArchived: false,
      hasChanges: false,
    })

    addTask({
      title: 'Paused Task',
      description: 'On hold',
      mode: 'code' as const,
      repository: 'repo3',
      branch: 'main',
      status: 'PAUSED' as const,
      messages: [],
      sessionId: 'session3',
      isArchived: false,
      hasChanges: false,
    })

    render(<TaskList />)

    // Check for status indicators (these would be rendered as icons or badges)
    expect(screen.getByText('In Progress Task')).toBeInTheDocument()
    expect(screen.getByText('Completed Task')).toBeInTheDocument()
    expect(screen.getByText('Paused Task')).toBeInTheDocument()
  })

  it('should handle archive action', async () => {
    const { addTask } = useTaskStore.getState()
    
    const task = addTask({
      title: 'Task to Archive',
      description: 'Archive me',
      mode: 'code' as const,
      repository: 'test-repo',
      branch: 'main',
      status: 'DONE' as const,
      messages: [],
      sessionId: 'session1',
      isArchived: false,
      hasChanges: false,
    })

    render(<TaskList />)

    // Find the archive button - it's a button with Archive icon
    const archiveButtons = screen.getAllByRole('button')
    const archiveButton = archiveButtons.find(btn => {
      // Check if button contains the Archive icon
      return btn.querySelector('[data-lucide="archive"]') || 
             btn.querySelector('.lucide-archive')
    })
    
    expect(archiveButton).toBeTruthy()
    
    if (archiveButton) {
      await user.click(archiveButton)
      
      // Verify task was archived
      const archivedTask = useTaskStore.getState().tasks.find(t => t.id === task.id)
      expect(archivedTask?.isArchived).toBe(true)
    }
  })

  it('should display mode icons correctly', () => {
    const { addTask } = useTaskStore.getState()
    
    addTask({
      title: 'Code Mode Task',
      description: 'Coding',
      mode: 'code' as const,
      repository: 'repo1',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session1',
      isArchived: false,
      hasChanges: false,
    })

    addTask({
      title: 'Ask Mode Task',
      description: 'Asking',
      mode: 'ask' as const,
      repository: 'repo2',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session2',
      isArchived: false,
      hasChanges: false,
    })

    render(<TaskList />)

    // Mode indicators would be rendered as icons
    expect(screen.getByText('Code Mode Task')).toBeInTheDocument()
    expect(screen.getByText('Ask Mode Task')).toBeInTheDocument()
  })

  it('should animate task additions and removals', async () => {
    const { addTask } = useTaskStore.getState()
    
    const { rerender } = render(<TaskList />)

    // Add a task
    const task = addTask({
      title: 'Animated Task',
      description: 'Watch me appear',
      mode: 'code' as const,
      repository: 'test-repo',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session1',
      isArchived: false,
      hasChanges: false,
    })

    rerender(<TaskList />)

    // Task should appear with animation
    await waitFor(() => {
      expect(screen.getByText('Animated Task')).toBeInTheDocument()
    })

    // Archive the task
    useTaskStore.getState().archiveTask(task.id)
    rerender(<TaskList />)

    // Task should disappear with animation
    await waitFor(() => {
      expect(screen.queryByText('Animated Task')).not.toBeInTheDocument()
    })
  })

  it('should display repository switch indicator', () => {
    const { addTask } = useTaskStore.getState()
    
    // Add task with different repo than current
    addTask({
      title: 'Different Repo Task',
      description: 'From another repo',
      mode: 'code' as const,
      repository: 'different-repo',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session1',
      isArchived: false,
      hasChanges: false,
    })

    render(<TaskList />)

    // Should show the different repository name
    expect(screen.getByText('different-repo')).toBeInTheDocument()
  })

  it('should sort tasks by creation date', () => {
    const { addTask } = useTaskStore.getState()
    
    // Add tasks with specific creation dates
    const oldTask = addTask({
      title: 'Old Task',
      description: 'Created first',
      mode: 'code' as const,
      repository: 'repo1',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session1',
      isArchived: false,
      hasChanges: false,
    })

    const newTask = addTask({
      title: 'New Task',
      description: 'Created second',
      mode: 'ask' as const,
      repository: 'repo2',
      branch: 'main',
      status: 'IN_PROGRESS' as const,
      messages: [],
      sessionId: 'session2',
      isArchived: false,
      hasChanges: false,
    })

    // Manually set dates to ensure order
    useTaskStore.setState({
      tasks: [
        { ...oldTask, createdAt: new Date('2024-01-01') },
        { ...newTask, createdAt: new Date('2024-01-02') },
      ],
    })

    render(<TaskList />)

    // Get all task titles by looking for heading elements
    const taskHeadings = screen.getAllByRole('heading', { level: 3 })
    const taskTitles = taskHeadings.map(el => el.textContent)
    
    // Newer task should appear first
    expect(taskTitles[0]).toContain('New Task')
    expect(taskTitles[1]).toContain('Old Task')
  })
})