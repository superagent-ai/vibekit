"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExecutionLogs } from "@/components/execution-logs";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  PlayCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  Activity
} from "lucide-react";
import type { SessionMetadata } from "@/lib/session-logger";

interface SessionLogItemProps {
  session: SessionMetadata;
}

export function SessionLogItem({ session }: SessionLogItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <PlayCircle className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatDuration = (startTime: number, endTime?: number) => {
    const duration = (endTime || Date.now()) - startTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <Card className="mb-2">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="w-full">
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" className="h-auto p-1">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <div className="flex items-center gap-2">
                    {getStatusIcon(session.status)}
                    <div>
                      <CardTitle className="text-sm font-medium">
                        {session.agentName} Session
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {new Date(session.startTime).toLocaleString()}
                      </CardDescription>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusColor(session.status)} className="text-xs">
                    {session.status}
                  </Badge>
                  
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDuration(session.startTime, session.endTime)}
                  </div>
                  
                  {session.exitCode !== undefined && (
                    <Badge variant={session.exitCode === 0 ? "secondary" : "destructive"} className="text-xs">
                      Exit {session.exitCode}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Session Details Row */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                {session.taskId && (
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Task: {session.taskId}
                  </div>
                )}
                {session.subtaskId && (
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Subtask: {session.subtaskId}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {session.agentName}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(session.startTime).toLocaleDateString()}
                </div>
              </div>
            </CardHeader>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Session Logs
              </h4>
              
              <div className="bg-muted/30 rounded-md border">
                <ExecutionLogs sessionId={session.sessionId} className="max-h-96" />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}