"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionLogItem } from "@/components/session-log-item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Activity,
  Filter,
  RefreshCw,
  Loader2
} from "lucide-react";
import type { SessionMetadata } from "@/lib/session-logger";

interface ProjectSessionsProps {
  projectId: string;
  projectName: string;
}

type StatusFilter = 'all' | 'running' | 'completed' | 'failed';

export function ProjectSessions({ projectId, projectName }: ProjectSessionsProps) {
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/sessions?projectId=${encodeURIComponent(projectId)}&limit=100`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch sessions');
      }
      
      if (data.success) {
        setSessions(data.sessions || []);
      } else {
        throw new Error(data.error || 'Failed to fetch sessions');
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchSessions();
  }, [projectId]);

  // Filter sessions based on status
  const filteredSessions = sessions.filter(session => {
    if (statusFilter === 'all') return true;
    return session.status === statusFilter;
  });

  // Get status counts for badges
  const statusCounts = sessions.reduce((acc, session) => {
    acc[session.status] = (acc[session.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center flex items-center gap-2 justify-center">
            <Loader2 className="animate-spin h-4 w-4 text-primary" />
            <p className="text-sm text-muted-foreground">Loading sessions...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Error Loading Sessions</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Project Sessions
          </CardTitle>
          <CardDescription>
            All coding agent sessions for {projectName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Sessions Found</h3>
            <p className="text-muted-foreground">
              No agent sessions have been recorded for this project yet.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Sessions will appear here when you run coding agents in this project.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Project Sessions
              </CardTitle>
              <CardDescription>
                {sessions.length} session{sessions.length !== 1 ? 's' : ''} for {projectName}
              </CardDescription>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Status summary and filter */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Total: {sessions.length}
              </Badge>
              {statusCounts.running > 0 && (
                <Badge variant="default" className="text-xs bg-blue-100 text-blue-800 border-blue-200">
                  Running: {statusCounts.running}
                </Badge>
              )}
              {statusCounts.completed > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Completed: {statusCounts.completed}
                </Badge>
              )}
              {statusCounts.failed > 0 && (
                <Badge variant="destructive" className="text-xs">
                  Failed: {statusCounts.failed}
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sessions</SelectItem>
                  <SelectItem value="running">Running Only</SelectItem>
                  <SelectItem value="completed">Completed Only</SelectItem>
                  <SelectItem value="failed">Failed Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Sessions list */}
      <div className="space-y-2">
        {filteredSessions.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">
                No sessions match the current filter.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredSessions.map((session) => (
            <SessionLogItem key={session.sessionId} session={session} />
          ))
        )}
      </div>
    </div>
  );
}