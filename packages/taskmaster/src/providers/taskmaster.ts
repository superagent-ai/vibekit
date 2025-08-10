import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'eventemitter3';
import type {
  TaskProvider,
  TaskProviderOptions,
  TasksData,
  TaggedTasks,
  TaskUpdate,
  TaskChangeEvent,
  Task,
} from '../types';

export class TaskmasterProvider extends EventEmitter implements TaskProvider {
  private projectRoot: string;
  private tasksPath: string;
  private watcher: any = null;

  constructor(options: TaskProviderOptions) {
    super();
    this.projectRoot = options.projectRoot;
    this.tasksPath = options.tasksPath || '.taskmaster/tasks/tasks.json';
  }

  getTasksPath(): string {
    return path.join(this.projectRoot, this.tasksPath);
  }

  async getTasks(): Promise<TasksData | TaggedTasks> {
    const fullPath = this.getTasksPath();
    
    try {
      await fs.access(fullPath);
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      const tasksData = JSON.parse(fileContent);
      return tasksData;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`No tasks file found at ${fullPath}. Make sure Taskmaster is initialized for this project.`);
      }
      throw error;
    }
  }

  async updateTask(update: TaskUpdate): Promise<void> {
    const fullPath = this.getTasksPath();
    
    try {
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      const tasksData = JSON.parse(fileContent);
      
      if (update.tag && tasksData[update.tag]) {
        const tasks = tasksData[update.tag].tasks;
        const taskIndex = tasks.findIndex((t: Task) => t.id === update.taskId);
        
        if (taskIndex !== -1) {
          if (update.status !== undefined) {
            tasks[taskIndex].status = update.status;
          }
          if (update.priority !== undefined) {
            tasks[taskIndex].priority = update.priority;
          }
          if (update.title !== undefined) {
            tasks[taskIndex].title = update.title;
          }
          if (update.description !== undefined) {
            tasks[taskIndex].description = update.description;
          }
          if (update.details !== undefined) {
            tasks[taskIndex].details = update.details;
          }
          if (update.testStrategy !== undefined) {
            tasks[taskIndex].testStrategy = update.testStrategy;
          }
          
          tasksData[update.tag].metadata.updated = new Date().toISOString();
        }
      } else if (tasksData.tasks) {
        const taskIndex = tasksData.tasks.findIndex((t: Task) => t.id === update.taskId);
        
        if (taskIndex !== -1) {
          if (update.status !== undefined) {
            tasksData.tasks[taskIndex].status = update.status;
          }
          if (update.priority !== undefined) {
            tasksData.tasks[taskIndex].priority = update.priority;
          }
          if (update.title !== undefined) {
            tasksData.tasks[taskIndex].title = update.title;
          }
          if (update.description !== undefined) {
            tasksData.tasks[taskIndex].description = update.description;
          }
          if (update.details !== undefined) {
            tasksData.tasks[taskIndex].details = update.details;
          }
          if (update.testStrategy !== undefined) {
            tasksData.tasks[taskIndex].testStrategy = update.testStrategy;
          }
          
          if (tasksData.metadata) {
            tasksData.metadata.updated = new Date().toISOString();
          }
        }
      }
      
      await fs.writeFile(fullPath, JSON.stringify(tasksData, null, 2));
      
      this.emit('tasks-updated', {
        type: 'tasks-updated',
        timestamp: new Date(),
      } as TaskChangeEvent);
    } catch (error) {
      throw new Error(`Failed to update task: ${error}`);
    }
  }

  watchTasks(callback: (event: TaskChangeEvent) => void): () => void {
    const fullPath = this.getTasksPath();
    const dir = path.dirname(fullPath);
    const filename = path.basename(fullPath);
    
    // Dynamic import for chokidar to avoid client-side bundling issues
    const chokidar = require('chokidar');
    this.watcher = chokidar.watch(fullPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });
    
    this.watcher.on('change', () => {
      callback({
        type: 'tasks-updated',
        timestamp: new Date(),
      });
    });
    
    this.watcher.on('add', () => {
      callback({
        type: 'file-created',
        timestamp: new Date(),
      });
    });
    
    this.watcher.on('unlink', () => {
      callback({
        type: 'file-deleted',
        timestamp: new Date(),
      });
    });
    
    this.on('tasks-updated', callback);
    
    return () => {
      if (this.watcher) {
        this.watcher.close();
        this.watcher = null;
      }
      this.off('tasks-updated', callback);
    };
  }

  async ensureTasksFile(): Promise<void> {
    const fullPath = this.getTasksPath();
    const dir = path.dirname(fullPath);
    
    try {
      await fs.access(fullPath);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      
      const initialData: TasksData = {
        master: {
          tasks: [],
          metadata: {
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            description: 'Main task list',
          },
        },
      };
      
      await fs.writeFile(fullPath, JSON.stringify(initialData, null, 2));
    }
  }
}