"use client";

import React, { memo, useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Todo } from "@/lib/todo-parser";
import { 
  CheckCircle,
  Circle,
  Clock,
  List,
  Calendar,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface TodoListPanelProps {
  todos: Todo[];
  lastUpdated?: string;
  className?: string;
}

export const TodoListPanel = memo(function TodoListPanel({ todos, lastUpdated, className }: TodoListPanelProps) {
  // Calculate completion rate to determine default expanded state
  const completionRate = todos.length > 0 ? Math.round((todos.filter(t => t.status === 'completed').length / todos.length) * 100) : 0;
  
  // Default to collapsed if 100% complete, expanded otherwise
  const [isExpanded, setIsExpanded] = useState(completionRate < 100);
  
  // Update expanded state when completion rate changes (only auto-collapse when reaching 100%)
  useEffect(() => {
    // Only auto-collapse when reaching 100% completion
    if (completionRate === 100) {
      setIsExpanded(false);
    }
    // Don't auto-expand when completion rate goes below 100% - let user control that
  }, [completionRate]);
  const getStatusIcon = (status: Todo['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'in_progress':
        return <Clock className="h-3 w-3 text-blue-600" />;
      case 'pending':
      default:
        return <Circle className="h-3 w-3 text-gray-400" />;
    }
  };
  
  const getPriorityButton = (priority?: string) => {
    if (!priority) return null;
    
    let letter: string;
    let className: string;
    
    switch (priority) {
      case 'high':
        letter = 'H';
        className = 'bg-red-500 text-white text-[8px] w-2.5 h-2.5';
        break;
      case 'medium':
        letter = 'M';
        className = 'bg-orange-500 text-white text-[8px] w-2.5 h-2.5';
        break;
      case 'low':
        letter = 'L';
        className = 'bg-green-500 text-white text-[8px] w-2.5 h-2.5';
        break;
      default:
        return null;
    }
    
    return (
      <div className={`rounded-full flex items-center justify-center font-bold ${className}`}>
        {letter}
      </div>
    );
  };

  const getStatusCounts = () => {
    const counts = {
      completed: todos.filter(t => t.status === 'completed').length,
      in_progress: todos.filter(t => t.status === 'in_progress').length,
      pending: todos.filter(t => t.status === 'pending').length,
    };
    return counts;
  };

  const statusCounts = getStatusCounts();

  return (
    <div className={`border rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 transition-all duration-300 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-white/50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-blue-600" />
          ) : (
            <ChevronRight className="h-3 w-3 text-blue-600" />
          )}
          <List className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
            To-Do List
          </h3>
          <Badge variant="outline" className="text-xs">
            {todos.length} items
          </Badge>
          <Badge variant="outline" className="text-xs text-green-700 bg-green-50">
            {completionRate}% complete
          </Badge>
        </div>
        
        {lastUpdated && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Updated {dayjs(lastUpdated).fromNow()}</span>
          </div>
        )}
      </div>

      {isExpanded && (
        <>
          {/* Progress Bar */}
          <div className="px-3 pt-2">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div 
                className="bg-gradient-to-r from-blue-500 to-green-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>

          {/* Status Summary */}
          <div className="flex items-center gap-3 px-3 py-2 text-xs">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-600" />
              <span className="text-green-700">{statusCounts.completed} completed</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-blue-600" />
              <span className="text-blue-700">{statusCounts.in_progress} in progress</span>
            </div>
            <div className="flex items-center gap-1">
              <Circle className="h-3 w-3 text-gray-400" />
              <span className="text-gray-600">{statusCounts.pending} pending</span>
            </div>
          </div>

          {/* Todo Items */}
          <div className="p-3 pt-0 space-y-1">
            {todos.map((todo) => (
              <div 
                key={todo.id} 
                className="flex items-start gap-1.5 p-2 rounded bg-white/60 dark:bg-gray-800/60 text-[11px] transition-all duration-200 hover:bg-white/80"
              >
                <div className="mt-0.5 flex-shrink-0">
                  {getStatusIcon(todo.status)}
                </div>
                <p className={`flex-1 leading-tight ${todo.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {todo.content}
                </p>
                {todo.priority && (
                  <div className="mt-0.5 flex-shrink-0">
                    {getPriorityButton(todo.priority)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});