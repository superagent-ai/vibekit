"use client";

import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from '@xyflow/react';

interface DependencyEdgeProps extends EdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  style?: React.CSSProperties;
}

export function DependencyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
}: DependencyEdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition: 'bottom' as const,
    targetX,
    targetY,
    targetPosition: 'top' as const,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: '#374151',
        strokeWidth: 2,
        ...style,
      }}
    />
  );
}

export function SubtaskEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
}: DependencyEdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition: 'bottom' as const,
    targetX,
    targetY,
    targetPosition: 'top' as const,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: '#6b7280',
        strokeWidth: 1,
        strokeDasharray: '5,5',
        ...style,
      }}
    />
  );
}