'use client'

import { Suspense } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LogViewer } from '@/components/log-viewer'

interface TaskDetailPageProps {
  params: Promise<{
    id: string
    taskId: string
  }>
}

// This would typically come from an API call
async function getTaskDetails(projectId: string, taskId: string) {
  // For now, return mock data
  return {
    id: taskId,
    title: `Task ${taskId}`,
    description: 'Task description goes here',
    status: 'running' as const,
    createdAt: new Date(),
    subtasks: [
      {
        id: '1',
        name: 'Initialize environment',
        status: 'completed' as const,
      },
      {
        id: '2', 
        name: 'Run build process',
        status: 'running' as const,
      },
      {
        id: '3',
        name: 'Deploy to staging',
        status: 'pending' as const,
      },
    ],
  }
}

function TaskDetailContent({ projectId, taskId }: { projectId: string, taskId: string }) {
  // In a real implementation, this would be an async component or use a data fetching hook
  const task = {
    id: taskId,
    title: `Task ${taskId}`,
    description: 'Task description goes here',
    status: 'running' as const,
    createdAt: new Date(),
    subtasks: [
      {
        id: '1',
        name: 'Initialize environment',
        status: 'completed' as const,
      },
      {
        id: '2', 
        name: 'Run build process',
        status: 'running' as const,
      },
      {
        id: '3',
        name: 'Deploy to staging',
        status: 'pending' as const,
      },
    ],
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'pending':
        return 'bg-gray-100 text-gray-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{task.title}</CardTitle>
              <Badge className={getStatusColor(task.status)}>
                {task.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{task.description}</p>
            <div className="space-y-2">
              <h4 className="font-semibold">Subtasks</h4>
              {task.subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center justify-between p-2 border rounded">
                  <span>{subtask.name}</span>
                  <Badge className={getStatusColor(subtask.status)}>
                    {subtask.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <span className="font-semibold">Created:</span>
                <span className="ml-2 text-muted-foreground">
                  {task.createdAt.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="font-semibold">ID:</span>
                <span className="ml-2 text-muted-foreground">{task.id}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <LogViewer projectId={projectId} taskId={taskId} />
        </CardContent>
      </Card>
    </div>
  )
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { id: projectId, taskId } = await params

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href={`/projects/${projectId}`}>
                    Project {projectId}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Task {taskId}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <Suspense fallback={<div>Loading task details...</div>}>
          <TaskDetailContent projectId={projectId} taskId={taskId} />
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  )
}