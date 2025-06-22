import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTaskStore } from '@/stores/tasks'

describe('Task Store', () => {
  beforeEach(() => {
    // Reset the store before each test
    useTaskStore.setState({
      tasks: [],
      notifications: true,
    })
    // Clear mocks
    vi.clearAllMocks()
  })

  describe('addTask', () => {
    it('should add a new task', () => {
      const { addTask, tasks } = useTaskStore.getState()
      
      const newTask = addTask({
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
      })

      const updatedTasks = useTaskStore.getState().tasks
      expect(updatedTasks).toHaveLength(1)
      expect(updatedTasks[0]).toMatchObject({
        title: 'Test Task',
        description: 'Test Description',
        mode: 'code',
        repository: 'test-repo',
        branch: 'main',
        status: 'IN_PROGRESS',
      })
      expect(updatedTasks[0].id).toBeDefined()
      expect(updatedTasks[0].createdAt).toBeDefined()
    })

    it('should generate unique IDs for tasks', () => {
      const { addTask } = useTaskStore.getState()
      
      const task1 = addTask({
        title: 'Task 1',
        description: 'Description 1',
        mode: 'ask' as const,
        repository: 'repo1',
        branch: 'main',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'session1',
        isArchived: false,
        hasChanges: false,
      })

      const task2 = addTask({
        title: 'Task 2',
        description: 'Description 2',
        mode: 'code' as const,
        repository: 'repo2',
        branch: 'develop',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'session2',
        isArchived: false,
        hasChanges: false,
      })

      expect(task1.id).not.toBe(task2.id)
    })
  })

  describe('updateTask', () => {
    it('should update an existing task', () => {
      const { addTask, updateTask } = useTaskStore.getState()
      
      const task = addTask({
        title: 'Original Title',
        description: 'Original Description',
        mode: 'code' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'test-session',
        isArchived: false,
        hasChanges: false,
      })

      updateTask(task.id, {
        title: 'Updated Title',
        status: 'DONE' as const,
        hasChanges: true,
      })

      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === task.id)
      expect(updatedTask).toMatchObject({
        title: 'Updated Title',
        description: 'Original Description', // Should remain unchanged
        status: 'DONE',
        hasChanges: true,
      })
      expect(updatedTask?.updatedAt).toBeDefined()
    })

    it('should not update non-existent task', () => {
      const { updateTask, tasks } = useTaskStore.getState()
      
      updateTask('non-existent-id', { title: 'New Title' })
      
      expect(tasks).toHaveLength(0)
    })
  })

  describe('deleteTask', () => {
    it('should delete a task', () => {
      const { addTask, deleteTask } = useTaskStore.getState()
      
      const task = addTask({
        title: 'Task to Delete',
        description: 'Will be deleted',
        mode: 'ask' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'test-session',
        isArchived: false,
        hasChanges: false,
      })

      deleteTask(task.id)

      const tasks = useTaskStore.getState().tasks
      expect(tasks).toHaveLength(0)
    })
  })

  describe('getTask', () => {
    it('should get a task by ID', () => {
      const { addTask, getTask } = useTaskStore.getState()
      
      const task = addTask({
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
      })

      const retrievedTask = getTask(task.id)
      expect(retrievedTask).toEqual(task)
    })

    it('should return undefined for non-existent task', () => {
      const { getTask } = useTaskStore.getState()
      
      const task = getTask('non-existent-id')
      expect(task).toBeUndefined()
    })
  })

  describe('getActiveTasks', () => {
    it('should return only non-archived tasks', () => {
      const { addTask, archiveTask, getActiveTasks } = useTaskStore.getState()
      
      // Add active tasks
      addTask({
        title: 'Active Task 1',
        description: 'Active',
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
        description: 'Active',
        mode: 'ask' as const,
        repository: 'repo2',
        branch: 'main',
        status: 'DONE' as const,
        messages: [],
        sessionId: 'session2',
        isArchived: false,
        hasChanges: false,
      })

      // Add task that will be archived
      const taskToArchive = addTask({
        title: 'Archived Task',
        description: 'Archived',
        mode: 'code' as const,
        repository: 'repo3',
        branch: 'main',
        status: 'DONE' as const,
        messages: [],
        sessionId: 'session3',
        isArchived: false,
        hasChanges: false,
      })
      
      // Archive the task
      archiveTask(taskToArchive.id)

      const activeTasks = getActiveTasks()
      expect(activeTasks).toHaveLength(2)
      expect(activeTasks.every(t => !t.isArchived)).toBe(true)
    })

    it('should return tasks sorted by creation date (newest first)', () => {
      const { addTask, getActiveTasks } = useTaskStore.getState()
      
      // Add tasks with different creation times
      const task1 = addTask({
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

      // Simulate time passing
      const task2 = addTask({
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

      // Manually set creation dates to ensure order
      useTaskStore.setState({
        tasks: [
          { ...task1, createdAt: new Date('2024-01-01') },
          { ...task2, createdAt: new Date('2024-01-02') },
        ]
      })

      const activeTasks = getActiveTasks()
      expect(activeTasks[0].title).toBe('New Task')
      expect(activeTasks[1].title).toBe('Old Task')
    })
  })

  describe('archiveTask', () => {
    it('should archive a task', () => {
      const { addTask, archiveTask } = useTaskStore.getState()
      
      const task = addTask({
        title: 'Task to Archive',
        description: 'Will be archived',
        mode: 'code' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'DONE' as const,
        messages: [],
        sessionId: 'test-session',
        isArchived: false,
        hasChanges: false,
      })

      archiveTask(task.id)

      const archivedTask = useTaskStore.getState().tasks.find(t => t.id === task.id)
      expect(archivedTask?.isArchived).toBe(true)
    })
  })

  describe('unarchiveTask', () => {
    it('should unarchive a task', () => {
      const { addTask, archiveTask, unarchiveTask } = useTaskStore.getState()
      
      const task = addTask({
        title: 'Archived Task',
        description: 'Currently archived',
        mode: 'ask' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'DONE' as const,
        messages: [],
        sessionId: 'test-session',
        isArchived: false,
        hasChanges: false,
      })
      
      // First archive the task
      archiveTask(task.id)
      
      // Verify it's archived
      let archivedTask = useTaskStore.getState().tasks.find(t => t.id === task.id)
      expect(archivedTask?.isArchived).toBe(true)

      // Then unarchive it
      unarchiveTask(task.id)

      const unarchivedTask = useTaskStore.getState().tasks.find(t => t.id === task.id)
      expect(unarchivedTask?.isArchived).toBe(false)
    })
  })

  describe('persistence', () => {
    it('should persist tasks to localStorage', () => {
      const { addTask } = useTaskStore.getState()
      
      addTask({
        title: 'Persistent Task',
        description: 'Should be saved',
        mode: 'code' as const,
        repository: 'test-repo',
        branch: 'main',
        status: 'IN_PROGRESS' as const,
        messages: [],
        sessionId: 'test-session',
        isArchived: false,
        hasChanges: false,
      })

      // Check that localStorage was called
      expect(localStorage.setItem).toHaveBeenCalled()
      const calls = (localStorage.setItem as any).mock.calls
      const taskCall = calls.find((call: any[]) => call[0] === 'tasks-storage')
      expect(taskCall).toBeDefined()
    })
  })

  describe('notifications', () => {
    it('should respect notification settings', () => {
      const { setNotifications, notifications } = useTaskStore.getState()
      
      expect(notifications).toBe(true) // Default value
      
      setNotifications(false)
      expect(useTaskStore.getState().notifications).toBe(false)
      
      setNotifications(true)
      expect(useTaskStore.getState().notifications).toBe(true)
    })
  })
})