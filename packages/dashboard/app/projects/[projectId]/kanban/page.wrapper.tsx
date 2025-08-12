"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ProjectKanbanPageWrapper() {
  const params = useParams();
  const router = useRouter();
  const projectId = params ? (Array.isArray(params.projectId) ? params.projectId[0] : params.projectId as string) : '';

  useEffect(() => {
    // Redirect to the Tasks tab on the project detail page
    if (projectId) {
      router.replace(`/projects/${projectId}?tab=tasks`);
    }
  }, [projectId, router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-muted-foreground">Redirecting to Tasks view...</p>
    </div>
  );
}