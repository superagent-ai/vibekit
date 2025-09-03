import { Node, Edge } from '@xyflow/react';

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'review' | 'done' | 'deferred' | 'cancelled';
  dependencies: number[];
  subtasks: Subtask[];
  details?: string;
}

interface Subtask {
  id: number;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'review' | 'done' | 'deferred' | 'cancelled';
  dependencies: number[];
  details?: string;
}

export interface TaskNode extends Node {
  data: {
    task: Task;
    label: string;
    parentTaskId?: number; // Parent task ID for subtasks
    isOnCriticalPath?: boolean;
    onClick?: (task: Task, parentTaskId?: number) => void;
  };
}

export interface TaskEdge extends Edge {
  type: 'dependency' | 'subtask';
  animated?: boolean;
  style?: {
    stroke: string;
    strokeWidth: number;
  };
}

/**
 * Convert tasks array into React Flow nodes and edges
 */
export function buildGraph(
  tasks: Task[],
  onTaskClick?: (task: Task, parentTaskId?: number) => void
): { nodes: TaskNode[], edges: TaskEdge[] } {
  const nodes: TaskNode[] = [];
  const edges: TaskEdge[] = [];
  
  // Create a map of task ID to task for quick lookup
  const taskMap = new Map<number, Task>();
  tasks.forEach(task => taskMap.set(task.id, task));

  // Create nodes for all tasks
  tasks.forEach((task, index) => {
    const node: TaskNode = {
      id: `task-${task.id}`,
      type: 'task',
      position: { x: 0, y: 0 }, // Will be set by layout algorithm
      data: {
        task,
        label: task.title,
        onClick: onTaskClick,
      },
    };
    nodes.push(node);

    // Create subtask nodes
    task.subtasks?.forEach((subtask) => {
      const subtaskNode: TaskNode = {
        id: `subtask-${task.id}-${subtask.id}`,
        type: 'subtask',
        position: { x: 0, y: 0 },
        data: {
          task: {
            ...subtask,
            subtasks: [], // Subtasks don't have their own subtasks
            details: subtask.details || '',
            priority: 'medium' as const, // Default priority for subtasks
          },
          label: subtask.title,
          parentTaskId: task.id, // Add parent task ID for display
          onClick: onTaskClick,
        },
      };
      nodes.push(subtaskNode);

      // Create edge from parent task to subtask
      const subtaskEdge: TaskEdge = {
        id: `subtask-edge-${task.id}-${subtask.id}`,
        source: `task-${task.id}`,
        target: `subtask-${task.id}-${subtask.id}`,
        type: 'subtask',
        style: {
          stroke: '#6b7280',
          strokeWidth: 1,
        },
      };
      edges.push(subtaskEdge);
    });
  });

  // Create dependency edges between tasks
  tasks.forEach((task) => {
    task.dependencies.forEach((depId) => {
      // Check if dependency exists in our task set
      if (taskMap.has(depId)) {
        const edge: TaskEdge = {
          id: `dep-${depId}-${task.id}`,
          source: `task-${depId}`,
          target: `task-${task.id}`,
          type: 'dependency',
          style: {
            stroke: '#374151',
            strokeWidth: 2,
          },
        };
        edges.push(edge);
      }
    });

    // Create dependency edges for subtasks
    task.subtasks?.forEach((subtask) => {
      subtask.dependencies.forEach((depId) => {
        // Check if it's a dependency on another task
        if (taskMap.has(depId)) {
          const edge: TaskEdge = {
            id: `subtask-dep-${depId}-${task.id}-${subtask.id}`,
            source: `task-${depId}`,
            target: `subtask-${task.id}-${subtask.id}`,
            type: 'dependency',
            style: {
              stroke: '#6b7280',
              strokeWidth: 1,
            },
          };
          edges.push(edge);
        }
        // Check if it's a dependency on another subtask within the same task
        else {
          const parentSubtask = task.subtasks.find(st => st.id === depId);
          if (parentSubtask) {
            const edge: TaskEdge = {
              id: `subtask-dep-${task.id}-${depId}-${subtask.id}`,
              source: `subtask-${task.id}-${depId}`,
              target: `subtask-${task.id}-${subtask.id}`,
              type: 'dependency',
              style: {
                stroke: '#6b7280',
                strokeWidth: 1,
              },
            };
            edges.push(edge);
          }
        }
      });
    });
  });

  return { nodes, edges };
}

/**
 * Calculate the critical path through the task graph
 */
export function calculateCriticalPath(tasks: Task[]): Set<number> {
  const criticalPath = new Set<number>();
  
  // Build adjacency list and in-degree count
  const graph = new Map<number, number[]>();
  const inDegree = new Map<number, number>();
  const taskDuration = new Map<number, number>(); // Simplified: all tasks have duration 1
  
  tasks.forEach(task => {
    graph.set(task.id, []);
    inDegree.set(task.id, 0);
    taskDuration.set(task.id, 1);
  });
  
  tasks.forEach(task => {
    task.dependencies.forEach(depId => {
      if (graph.has(depId)) {
        graph.get(depId)!.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      }
    });
  });
  
  // Topological sort to find longest path
  const queue: number[] = [];
  const distance = new Map<number, number>();
  
  tasks.forEach(task => {
    distance.set(task.id, 0);
    if (inDegree.get(task.id) === 0) {
      queue.push(task.id);
    }
  });
  
  let maxDistance = 0;
  let endNode = -1;
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDist = distance.get(current)!;
    
    graph.get(current)?.forEach(neighbor => {
      const newDist = currentDist + (taskDuration.get(current) || 1);
      if (newDist > (distance.get(neighbor) || 0)) {
        distance.set(neighbor, newDist);
      }
      
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
        
        if (newDist > maxDistance) {
          maxDistance = newDist;
          endNode = neighbor;
        }
      }
    });
  }
  
  // Backtrack to find the critical path
  if (endNode !== -1) {
    const visited = new Set<number>();
    const findCriticalPath = (node: number, targetDist: number) => {
      if (visited.has(node)) return;
      visited.add(node);
      
      if (distance.get(node) === targetDist) {
        criticalPath.add(node);
        
        // Find predecessors
        tasks.forEach(task => {
          if (task.dependencies.includes(node) && 
              distance.get(task.id)! === targetDist + (taskDuration.get(node) || 1)) {
            findCriticalPath(task.id, targetDist + (taskDuration.get(node) || 1));
          }
        });
      }
    };
    
    findCriticalPath(endNode, maxDistance);
  }
  
  return criticalPath;
}

/**
 * Detect circular dependencies in the task graph
 */
export function detectCycles(tasks: Task[]): number[][] {
  const cycles: number[][] = [];
  const visited = new Set<number>();
  const recursionStack = new Set<number>();
  const path: number[] = [];
  
  const dfs = (taskId: number): boolean => {
    if (recursionStack.has(taskId)) {
      // Found a cycle, extract it from the path
      const cycleStart = path.indexOf(taskId);
      if (cycleStart !== -1) {
        cycles.push([...path.slice(cycleStart), taskId]);
      }
      return true;
    }
    
    if (visited.has(taskId)) {
      return false;
    }
    
    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);
    
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      for (const depId of task.dependencies) {
        if (dfs(depId)) {
          return true;
        }
      }
    }
    
    recursionStack.delete(taskId);
    path.pop();
    return false;
  };
  
  tasks.forEach(task => {
    if (!visited.has(task.id)) {
      dfs(task.id);
    }
  });
  
  return cycles;
}

/**
 * Mark critical path nodes in the graph
 */
export function markCriticalPath(nodes: TaskNode[], criticalPath: Set<number>): TaskNode[] {
  return nodes.map(node => {
    const taskId = parseInt(node.id.split('-')[1]);
    if (criticalPath.has(taskId)) {
      return {
        ...node,
        data: {
          ...node.data,
          isOnCriticalPath: true,
        },
      };
    }
    return node;
  });
}