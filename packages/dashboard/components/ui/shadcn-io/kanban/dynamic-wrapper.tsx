'use client';

import { Suspense, lazy, useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Type definitions to avoid importing from @dnd-kit directly
export type DragEndEvent = {
  active: { id: string };
  over: { id: string } | null;
};

interface KanbanProviderProps {
  columns: any[];
  data: any[];
  onDataChange: (event: DragEndEvent) => void;
  className?: string;
  children: ((column: any) => React.ReactNode) | React.ReactNode;
}

// Loading component for kanban
function KanbanLoading() {
  return (
    <div className="grid gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}

// Dynamic import wrapper
export function DynamicKanbanProvider({ 
  columns, 
  data, 
  onDataChange, 
  className, 
  children 
}: KanbanProviderProps) {
  const [KanbanComponent, setKanbanComponent] = useState<React.ComponentType<any> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Dynamically import the kanban components only when needed
    const loadKanban = async () => {
      try {
        const kanbanModule = await import('./index');
        setKanbanComponent(() => kanbanModule.KanbanProvider);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load kanban components:', err);
        setError('Failed to load kanban board. Please ensure @dnd-kit packages are installed.');
        setIsLoading(false);
      }
    };

    loadKanban();
  }, []);

  if (error) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>{error}</p>
        <p className="text-sm mt-2">Run: npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities</p>
      </div>
    );
  }

  if (isLoading || !KanbanComponent) {
    return <KanbanLoading />;
  }

  return (
    <KanbanComponent
      columns={columns}
      data={data}
      onDataChange={onDataChange}
      className={className}
    >
      {children}
    </KanbanComponent>
  );
}

// Export dynamic versions of all kanban components
export const DynamicKanban = {
  Provider: DynamicKanbanProvider,
  Board: lazy(() => import('./index').then(m => ({ default: m.KanbanBoard }))),
  Header: lazy(() => import('./index').then(m => ({ default: m.KanbanHeader }))),
  Cards: lazy(() => import('./index').then(m => ({ default: m.KanbanCards }))),
  Card: lazy(() => import('./index').then(m => ({ default: m.KanbanCard }))),
};