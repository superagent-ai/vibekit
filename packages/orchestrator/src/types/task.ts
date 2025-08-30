export interface Task {
  id: string;
  title: string;
  description: string;
  details?: string;
  testStrategy?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  subtasks?: Task[];
  dependencies?: string[];
  fileScope?: string[]; // File patterns this task should work on
  estimatedHours?: number;
  tags?: string[]; // Tags for grouping tasks (replaces epic concept)
  parentTaskId?: string; // Reference to parent task for subtasks
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TaskEvent {
  type: 'task.created' | 'task.updated' | 'task.deleted';
  taskId: string;
  parentTaskId?: string; // For subtask events
  data: any;
  timestamp: Date;
}

export interface TaskComplexity {
  level: 'simple' | 'moderate' | 'complex';
  estimatedHours: number;
  suggestedAgentTypes: string[];
  fileScopes: string[];
  dependencies: string[];
  risks: string[];
}