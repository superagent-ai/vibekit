"use client";

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CheckCircle, Clock, Circle, AlertCircle, X } from 'lucide-react';

interface TaskNodeData {
  task: {
    id: number;
    title: string;
    description?: string;
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'in-progress' | 'review' | 'done' | 'deferred' | 'cancelled';
    dependencies: number[];
    subtasks: any[];
  };
  label: string;
  isOnCriticalPath?: boolean;
  onClick?: (task: any) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending':
      return <Circle className="h-3 w-3" />;
    case 'in-progress':
      return <Clock className="h-3 w-3" />;
    case 'review':
      return <AlertCircle className="h-3 w-3" />;
    case 'done':
      return <CheckCircle className="h-3 w-3" />;
    case 'deferred':
      return <Clock className="h-3 w-3" />;
    case 'cancelled':
      return <X className="h-3 w-3" />;
    default:
      return <Circle className="h-3 w-3" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'text-gray-600 border-gray-300';
    case 'in-progress':
      return 'text-blue-600 border-blue-300';
    case 'review':
      return 'text-purple-600 border-purple-300';
    case 'done':
      return 'text-green-600 border-green-300';
    case 'deferred':
      return 'text-yellow-600 border-yellow-300';
    case 'cancelled':
      return 'text-red-600 border-red-300';
    default:
      return 'text-gray-600 border-gray-300';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'default';
    case 'low':
      return 'secondary';
    default:
      return 'outline';
  }
};

const getProgressPercentage = (task: any): number => {
  if (!task.subtasks || task.subtasks.length === 0) {
    return task.status === 'done' ? 100 : 0;
  }
  
  const completedSubtasks = task.subtasks.filter((st: any) => st.status === 'done').length;
  return Math.round((completedSubtasks / task.subtasks.length) * 100);
};

export const TaskNode = memo(({ data, selected }: NodeProps) => {
  const { task, isOnCriticalPath, onClick } = data as unknown as TaskNodeData;
  const statusColor = getStatusColor(task.status);
  const progress = getProgressPercentage(task);
  
  const handleClick = () => {
    if (onClick) {
      onClick(task);
    }
  };

  return (
    <>
      {/* Input handle at top */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-gray-400"
      />
      
      <Card 
        className={`
          min-w-[200px] max-w-[250px] p-3 cursor-pointer transition-all duration-200
          ${selected ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'}
          ${isOnCriticalPath ? 'ring-2 ring-orange-500 bg-orange-50' : ''}
          border-l-4 ${statusColor.split(' ')[1]}
        `}
        onClick={handleClick}
      >
        <div className="space-y-2">
          {/* Header with title and status */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm leading-tight truncate">
                {task.title}
              </h3>
              <div className="flex items-center gap-1 mt-1">
                <span className={`flex items-center gap-1 text-xs ${statusColor.split(' ')[0]}`}>
                  {getStatusIcon(task.status)}
                  {task.status}
                </span>
              </div>
            </div>
            <Badge 
              variant={getPriorityColor(task.priority) as any}
              className="text-xs shrink-0"
            >
              {task.priority}
            </Badge>
          </div>

          {/* Description if available */}
          {task.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Progress bar for subtasks */}
          {task.subtasks && task.subtasks.length > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{task.subtasks.length} subtasks</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer with task ID and dependency count */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {task.dependencies.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  Deps: {task.dependencies.length}
                </Badge>
              )}
              {isOnCriticalPath && (
                <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                  Critical
                </Badge>
              )}
            </div>
            <span>#{task.id}</span>
          </div>
        </div>
      </Card>
      
      {/* Output handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-gray-400"
      />
    </>
  );
});

TaskNode.displayName = 'TaskNode';