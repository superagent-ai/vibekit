/**
 * Taskmaster UI Components
 * Export reusable components that can be imported and used in any React application
 */

// Re-export the kanban components from wherever they're implemented
// For now, we'll define the interface for what should be exported

export interface TaskmasterUIComponents {
  KanbanBoard: React.ComponentType<any>;
  TaskDetailsDialog: React.ComponentType<any>;
  TaskCard: React.ComponentType<any>;
}

// These components should be implemented here in the taskmaster package
// rather than in the dashboard, making them reusable

export const componentsPath = '@vibe-kit/taskmaster/components';

// Export a function to get the component paths for dynamic imports
export function getTaskmasterComponentPaths() {
  return {
    kanbanPage: '@vibe-kit/taskmaster/src/components/KanbanPage',
    taskDetailsDialog: '@vibe-kit/taskmaster/src/components/TaskDetailsDialog',
    kanbanBoard: '@vibe-kit/taskmaster/src/components/KanbanBoard',
  };
}