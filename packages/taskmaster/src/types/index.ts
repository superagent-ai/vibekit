export interface Subtask {
  id: number;
  title: string;
  description: string;
  dependencies: number[];
  details: string;
  status: TaskStatus;
  testStrategy: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  details: string;
  testStrategy: string;
  priority: TaskPriority;
  dependencies: number[];
  status: TaskStatus;
  subtasks: Subtask[];
}

export type TaskStatus = "pending" | "done" | "in-progress" | "review" | "deferred" | "cancelled";
export type TaskPriority = "high" | "medium" | "low";

export interface TaggedTasks {
  tasks: Task[];
  metadata: {
    created: string;
    updated: string;
    description: string;
  };
}

export interface TasksData {
  [tag: string]: TaggedTasks;
}

export interface TaskUpdate {
  taskId: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  title?: string;
  description?: string;
  details?: string;
  testStrategy?: string;
  tag?: string;
}

export interface TaskProviderOptions {
  projectRoot: string;
  tasksPath?: string;
}

export interface TaskProvider {
  getTasks(): Promise<TasksData | TaggedTasks>;
  updateTask(update: TaskUpdate): Promise<void>;
  watchTasks(callback: (event: TaskChangeEvent) => void): () => void;
  getTasksPath(): string;
}

export interface TaskChangeEvent {
  type: 'tasks-updated' | 'file-created' | 'file-deleted';
  timestamp: Date;
  data?: any;
}