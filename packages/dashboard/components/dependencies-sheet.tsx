"use client";

import React, { useEffect, useState, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DependencyTreeView } from './dependency-tree/dependency-tree-view';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Network, 
  Download, 
  AlertTriangle, 
  Info,
  CheckCircle,
  Clock,
  Circle,
  AlertCircle,
  X
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'review' | 'done' | 'deferred' | 'cancelled';
  dependencies: number[];
  subtasks: any[];
}

interface DependenciesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  projectName?: string;
  onTaskClick?: (task: Task, parentTaskId?: number) => void;
}

export function DependenciesSheet({ 
  open, 
  onOpenChange, 
  tasks, 
  projectName,
  onTaskClick 
}: DependenciesSheetProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && tasks.length > 0) {
      // Simulate loading time for complex graphs
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    } else if (open) {
      setIsLoading(false);
    }
  }, [open, tasks]);

  // Calculate task statistics
  const stats = useMemo(() => {
    const totalTasks = tasks.length;
    const totalSubtasks = tasks.reduce((sum, task) => sum + (task.subtasks?.length || 0), 0);
    const totalDependencies = tasks.reduce((sum, task) => sum + task.dependencies.length, 0);
    
    const statusCounts = {
      pending: 0,
      'in-progress': 0,
      review: 0,
      done: 0,
      deferred: 0,
      cancelled: 0,
    };
    
    const priorityCounts = {
      high: 0,
      medium: 0,
      low: 0,
    };

    tasks.forEach(task => {
      statusCounts[task.status]++;
      priorityCounts[task.priority]++;
    });

    // Find tasks without dependencies (starting points)
    const startingTasks = tasks.filter(task => task.dependencies.length === 0);
    
    // Find tasks that nothing depends on (end points)
    const dependencySet = new Set(tasks.flatMap(task => task.dependencies));
    const endingTasks = tasks.filter(task => !dependencySet.has(task.id));

    return {
      totalTasks,
      totalSubtasks,
      totalDependencies,
      statusCounts,
      priorityCounts,
      startingTasks: startingTasks.length,
      endingTasks: endingTasks.length,
      averageDependencies: totalTasks > 0 ? (totalDependencies / totalTasks).toFixed(1) : '0',
    };
  }, [tasks]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Circle className="h-3 w-3" />;
      case 'in-progress': return <Clock className="h-3 w-3" />;
      case 'review': return <AlertCircle className="h-3 w-3" />;
      case 'done': return <CheckCircle className="h-3 w-3" />;
      case 'deferred': return <Clock className="h-3 w-3" />;
      case 'cancelled': return <X className="h-3 w-3" />;
      default: return <Circle className="h-3 w-3" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-gray-600';
      case 'in-progress': return 'text-blue-600';
      case 'review': return 'text-purple-600';
      case 'done': return 'text-green-600';
      case 'deferred': return 'text-yellow-600';
      case 'cancelled': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const handleExport = () => {
    // This would implement export functionality
    // For now, we'll just show a placeholder
    console.log('Export functionality would be implemented here');
  };

  if (tasks.length === 0) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-none">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Task Dependencies
            </SheetTitle>
            <SheetDescription>
              Visualize task relationships and dependencies
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex flex-1 items-center justify-center h-96">
            <div className="text-center max-w-md">
              <Network className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Tasks Available</h3>
              <p className="text-muted-foreground">
                There are no tasks to display in the dependency tree. Add some tasks to your project to see their relationships.
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-none">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Task Dependencies
            {projectName && <Badge variant="secondary">{projectName}</Badge>}
          </SheetTitle>
          <SheetDescription>
            Interactive visualization of task relationships and dependencies
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center h-96">
            <div className="text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
              <p className="text-muted-foreground">Building dependency graph...</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Quick Stats Row */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <Card className="p-2">
                <div className="text-center">
                  <div className="text-lg font-bold">{stats.totalTasks}</div>
                  <div className="text-xs text-muted-foreground">Tasks</div>
                </div>
              </Card>
              <Card className="p-2">
                <div className="text-center">
                  <div className="text-lg font-bold">{stats.totalSubtasks}</div>
                  <div className="text-xs text-muted-foreground">Subtasks</div>
                </div>
              </Card>
              <Card className="p-2">
                <div className="text-center">
                  <div className="text-lg font-bold">{stats.totalDependencies}</div>
                  <div className="text-xs text-muted-foreground">Dependencies</div>
                </div>
              </Card>
              <Card className="p-2">
                <div className="text-center">
                  <div className="text-lg font-bold">{stats.averageDependencies}</div>
                  <div className="text-xs text-muted-foreground">Avg/Task</div>
                </div>
              </Card>
            </div>

            <Separator className="mb-4" />

            {/* Main Tree View */}
            <div className="flex-1 min-h-0 border rounded-lg overflow-hidden">
              <DependencyTreeView
                tasks={tasks}
                onTaskClick={onTaskClick}
                className="h-full"
              />
            </div>

            {/* Footer with additional info */}
            <div className="pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    <span>Click nodes to view details</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>{stats.startingTasks} start points</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>{stats.endingTasks} end points</span>
                  </div>
                </div>
                
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-3 w-3 mr-1" />
                  Export
                </Button>
              </div>
              
              {/* Status breakdown */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Status:</span>
                {Object.entries(stats.statusCounts).map(([status, count]) => (
                  count > 0 && (
                    <div key={status} className={`flex items-center gap-1 ${getStatusColor(status)}`}>
                      {getStatusIcon(status)}
                      <span>{count}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}