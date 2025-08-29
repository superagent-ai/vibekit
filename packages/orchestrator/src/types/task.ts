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
}

export interface Epic {
  id: string;
  title: string;
  description: string;
  tasks: Task[];
  status: 'planning' | 'in_progress' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskEvent {
  type: 'task.created' | 'task.updated' | 'task.deleted' | 'epic.updated';
  taskId: string;
  epicId?: string;
  data: any;
  timestamp: Date;
}

export interface TaskComplexity {
  level: 'simple' | 'moderate' | 'complex' | 'epic';
  estimatedHours: number;
  suggestedAgentTypes: string[];
  fileScopes: string[];
  dependencies: string[];
  risks: string[];
}