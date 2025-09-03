import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

export interface LayoutOptions {
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  nodeWidth?: number;
  nodeHeight?: number;
  rankSeparation?: number;
  nodeSeparation?: number;
}

const defaultLayoutOptions: Required<LayoutOptions> = {
  direction: 'TB',
  nodeWidth: 250,
  nodeHeight: 120,
  rankSeparation: 80,
  nodeSeparation: 50,
};

/**
 * Apply hierarchical layout to nodes using Dagre
 */
export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: Partial<LayoutOptions> = {}
): { nodes: Node[], edges: Edge[] } {
  const layoutOptions = { ...defaultLayoutOptions, ...options };
  
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  // Configure the graph
  dagreGraph.setGraph({
    rankdir: layoutOptions.direction,
    ranksep: layoutOptions.rankSeparation,
    nodesep: layoutOptions.nodeSeparation,
  });

  // Add nodes to dagre graph
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: layoutOptions.nodeWidth,
      height: layoutOptions.nodeHeight,
    });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply calculated positions back to React Flow nodes
  const layoutedNodes: Node[] = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - layoutOptions.nodeWidth / 2,
        y: nodeWithPosition.y - layoutOptions.nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Calculate bounding box of all nodes
 */
export function calculateBounds(nodes: Node[]): { 
  minX: number, 
  minY: number, 
  maxX: number, 
  maxY: number,
  width: number,
  height: number
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const x = node.position.x;
    const y = node.position.y;
    const width = node.width || defaultLayoutOptions.nodeWidth;
    const height = node.height || defaultLayoutOptions.nodeHeight;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Center nodes in the viewport
 */
export function centerNodes(nodes: Node[], viewportWidth: number, viewportHeight: number): Node[] {
  const bounds = calculateBounds(nodes);
  
  if (bounds.width === 0 || bounds.height === 0) {
    return nodes;
  }

  const offsetX = (viewportWidth - bounds.width) / 2 - bounds.minX;
  const offsetY = (viewportHeight - bounds.height) / 2 - bounds.minY;

  return nodes.map(node => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));
}

/**
 * Apply different layout algorithms
 */
export enum LayoutType {
  HIERARCHICAL_TB = 'hierarchical-tb',
  HIERARCHICAL_LR = 'hierarchical-lr',
  FORCE_DIRECTED = 'force-directed',
  CIRCULAR = 'circular',
}

export function applyLayout(
  nodes: Node[],
  edges: Edge[],
  layoutType: LayoutType,
  viewportWidth?: number,
  viewportHeight?: number
): { nodes: Node[], edges: Edge[] } {
  let layoutedNodes: Node[];
  let layoutedEdges = edges;

  switch (layoutType) {
    case LayoutType.HIERARCHICAL_TB:
      ({ nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, {
        direction: 'TB',
        rankSeparation: 100,
        nodeSeparation: 80,
      }));
      break;
      
    case LayoutType.HIERARCHICAL_LR:
      ({ nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, {
        direction: 'LR',
        rankSeparation: 150,
        nodeSeparation: 80,
      }));
      break;
      
    case LayoutType.FORCE_DIRECTED:
      layoutedNodes = applyForceDirectedLayout(nodes, edges);
      break;
      
    case LayoutType.CIRCULAR:
      layoutedNodes = applyCircularLayout(nodes);
      break;
      
    default:
      layoutedNodes = nodes;
  }

  // Center the layout if viewport dimensions are provided
  if (viewportWidth && viewportHeight) {
    layoutedNodes = centerNodes(layoutedNodes, viewportWidth, viewportHeight);
  }

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

/**
 * Simple force-directed layout (basic implementation)
 */
function applyForceDirectedLayout(nodes: Node[], edges: Edge[]): Node[] {
  const width = 800;
  const height = 600;
  const center = { x: width / 2, y: height / 2 };
  
  // Initialize positions randomly around center
  return nodes.map((node, index) => {
    const angle = (index / nodes.length) * 2 * Math.PI;
    const radius = Math.min(width, height) * 0.3;
    
    return {
      ...node,
      position: {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      },
    };
  });
}

/**
 * Circular layout
 */
function applyCircularLayout(nodes: Node[]): Node[] {
  const width = 600;
  const height = 600;
  const center = { x: width / 2, y: height / 2 };
  const radius = Math.min(width, height) * 0.35;
  
  return nodes.map((node, index) => {
    const angle = (index / nodes.length) * 2 * Math.PI;
    
    return {
      ...node,
      position: {
        x: center.x + Math.cos(angle) * radius - defaultLayoutOptions.nodeWidth / 2,
        y: center.y + Math.sin(angle) * radius - defaultLayoutOptions.nodeHeight / 2,
      },
    };
  });
}