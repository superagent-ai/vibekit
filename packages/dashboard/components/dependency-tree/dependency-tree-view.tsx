"use client";

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TaskNode } from './task-node';
import { DependencyEdge, SubtaskEdge } from './dependency-edge';
import { buildGraph, calculateCriticalPath, markCriticalPath, detectCycles } from './utils/graph-builder';
import { applyLayout, LayoutType } from './utils/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  AlertTriangle,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'review' | 'done' | 'deferred' | 'cancelled';
  dependencies: number[];
  subtasks: any[];
}

interface DependencyTreeViewProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  className?: string;
}

const nodeTypes = {
  task: TaskNode,
  subtask: TaskNode,
};

const edgeTypes = {
  dependency: DependencyEdge,
  subtask: SubtaskEdge,
};

export function DependencyTreeView({ tasks, onTaskClick, className = '' }: DependencyTreeViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  const [layoutType, setLayoutType] = useState<LayoutType>(LayoutType.HIERARCHICAL_TB);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showSubtasks, setShowSubtasks] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Calculate graph data
  const { initialNodes, initialEdges, criticalPath, cycles } = useMemo(() => {
    const { nodes: graphNodes, edges: graphEdges } = buildGraph(tasks, onTaskClick);
    const criticalPathSet = calculateCriticalPath(tasks);
    const detectedCycles = detectCycles(tasks);
    
    let processedNodes = graphNodes;
    
    // Mark critical path if enabled
    if (showCriticalPath) {
      processedNodes = markCriticalPath(processedNodes, criticalPathSet);
    }
    
    // Filter subtasks if disabled
    let filteredEdges = graphEdges;
    if (!showSubtasks) {
      processedNodes = processedNodes.filter(node => !node.id.includes('subtask-'));
      filteredEdges = graphEdges.filter(edge => 
        !edge.id.includes('subtask-edge-') &&
        !edge.source.includes('subtask-') &&
        !edge.target.includes('subtask-')
      );
    }
    
    return {
      initialNodes: processedNodes,
      initialEdges: filteredEdges,
      criticalPath: criticalPathSet,
      cycles: detectedCycles,
    };
  }, [tasks, onTaskClick, showCriticalPath, showSubtasks]);

  // Apply layout when data changes
  useEffect(() => {
    if (initialNodes.length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = applyLayout(
        initialNodes,
        initialEdges,
        layoutType,
        1200, // viewport width
        800   // viewport height
      );
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  }, [initialNodes, initialEdges, layoutType, setNodes, setEdges]);

  const handleLayoutChange = useCallback((newLayoutType: string) => {
    setLayoutType(newLayoutType as LayoutType);
  }, []);

  const handleFitView = useCallback(() => {
    // This will be handled by React Flow's fitView function
    const fitViewButton = document.querySelector('[data-testid="rf__controls-fitview"]') as HTMLButtonElement;
    if (fitViewButton) {
      fitViewButton.click();
    }
  }, []);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
    // Additional logic for highlighting connected nodes could go here
  }, []);

  const stats = {
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'done').length,
    criticalPathLength: criticalPath.size,
    cyclesFound: cycles.length,
  };

  return (
    <TooltipProvider>
      <div className={`relative w-full h-full ${className}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Strict}
          fitView
          className="bg-gray-50"
        >
          <Background />
          
          <Controls
            showZoom
            showFitView
            showInteractive
            position="bottom-right"
          />
          
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(node) => {
              const task = (node.data as any)?.task;
              if (!task) return '#e5e7eb';
              
              switch (task.status) {
                case 'done': return '#22c55e';
                case 'in-progress': return '#3b82f6';
                case 'review': return '#a855f7';
                case 'pending': return '#6b7280';
                case 'deferred': return '#eab308';
                case 'cancelled': return '#ef4444';
                default: return '#e5e7eb';
              }
            }}
            position="bottom-left"
            className="!bg-white !border !border-gray-200 !rounded-lg"
          />

          {/* Top Control Panel */}
          <Panel position="top-left" className="bg-white p-4 rounded-lg border shadow-sm space-y-4 min-w-[300px]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Dependency Tree</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleFitView}>
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            {/* Layout Controls */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Layout</Label>
              <Select value={layoutType} onValueChange={handleLayoutChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LayoutType.HIERARCHICAL_TB}>Top to Bottom</SelectItem>
                  <SelectItem value={LayoutType.HIERARCHICAL_LR}>Left to Right</SelectItem>
                  <SelectItem value={LayoutType.FORCE_DIRECTED}>Force Directed</SelectItem>
                  <SelectItem value={LayoutType.CIRCULAR}>Circular</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Display Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Critical Path</Label>
                <Switch
                  checked={showCriticalPath}
                  onCheckedChange={setShowCriticalPath}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label className="text-xs">Subtasks</Label>
                <Switch
                  checked={showSubtasks}
                  onCheckedChange={setShowSubtasks}
                />
              </div>
            </div>
          </Panel>

          {/* Stats Panel */}
          <Panel position="top-right" className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Statistics</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Total Tasks:</span>
                  <div className="font-medium">{stats.totalTasks}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed:</span>
                  <div className="font-medium text-green-600">{stats.completedTasks}</div>
                </div>
                {showCriticalPath && (
                  <div>
                    <span className="text-muted-foreground">Critical Path:</span>
                    <div className="font-medium text-orange-600">{stats.criticalPathLength}</div>
                  </div>
                )}
                {cycles.length > 0 && (
                  <div className="col-span-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {cycles.length} Cycle{cycles.length !== 1 ? 's' : ''} Detected
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Circular dependencies found in tasks:</p>
                        {cycles.slice(0, 3).map((cycle, i) => (
                          <p key={i} className="text-xs">
                            {cycle.join(' → ')}
                          </p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            </div>
          </Panel>

          {/* Legend Panel */}
          <Panel position="bottom-center" className="bg-white p-3 rounded-lg border shadow-sm">
            <div className="flex items-center gap-4 text-xs">
              <span className="font-medium">Status:</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                <span>Pending</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>In Progress</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span>Review</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>Done</span>
              </div>
              {showCriticalPath && (
                <div className="flex items-center gap-1 ml-4">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span>Critical Path</span>
                </div>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </TooltipProvider>
  );
}