"use client";

import dynamic from 'next/dynamic';
import KanbanLoading from './loading';

// Lazy load the kanban page to reduce initial bundle size
const KanbanPage = dynamic(
  () => import('./kanban-content'),
  {
    loading: () => <KanbanLoading />,
    ssr: false // Disable SSR for this component since it uses client-side features
  }
);

export default function ProjectKanbanPageWrapper() {
  return <KanbanPage />;
}