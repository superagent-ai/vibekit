"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CompactStatusTable } from "@/components/compact-status-table";
import { HorizontalStatusBar } from "@/components/horizontal-status-bar";
import { ResourceUsageCharts } from "@/components/resource-usage-charts";
import { RecoveryStatus } from "@/components/recovery-status";
import { ActivityFeed } from "@/components/activity-feed";
import {
  Monitor,
  RefreshCw,
  XCircle,
  Server,
  Download,
  Clock
} from "lucide-react";

interface SystemHealth {
  overall: 'healthy' | 'warning' | 'error';
  timestamp: number;
  uptime: number;
  components: Array<{
    name: string;
    status: 'healthy' | 'warning' | 'error';
    message: string;
    details?: Record<string, any>;
    lastCheck?: number;
    errors?: string[];
  }>;
  metrics: {
    totalSessions: number;
    activeSessions: number;
    totalExecutions: number;
    activeExecutions: number;
    fileWatchers: number;
    activeLocks: number;
    diskUsage: {
      sessions: string;
      executions: string;
      analytics: string;
    };
    memory: {
      heapUsed: string;
      heapTotal: string;
      external: string;
    };
  };
  version: string;
  environment: string;
}

type TimeRange = '1h' | '24h' | '7d' | '30d';

export default function MonitoringPage() {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchSystemHealth = async () => {
    try {
      setError(null);
      const response = await fetch('/api/health');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch system health');
      }
      
      setSystemHealth(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch system health:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch system health');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSystemHealth();
    setRefreshing(false);
  };

  const handleTimeRangeChange = (newRange: TimeRange) => {
    setTimeRange(newRange);
    // Fetch new data for the selected time range
    fetchSystemHealth();
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      setExporting(true);
      
      // Calculate date range based on timeRange
      const now = Date.now();
      let dateFrom: number;
      
      switch (timeRange) {
        case '1h':
          dateFrom = now - (60 * 60 * 1000);
          break;
        case '24h':
          dateFrom = now - (24 * 60 * 60 * 1000);
          break;
        case '7d':
          dateFrom = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          dateFrom = now - (30 * 24 * 60 * 60 * 1000);
          break;
      }
      
      // Export execution history for the time range
      const url = `/api/execution-history/export?format=${format}&dateFrom=${dateFrom}&dateTo=${now}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      // Download the file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `monitoring-data-${timeRange}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export failed:', error);
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const getTimeRangeLabel = (range: TimeRange): string => {
    switch (range) {
      case '1h': return 'Last Hour';
      case '24h': return 'Last 24 Hours';
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
    }
  };

  useEffect(() => {
    fetchSystemHealth();
  }, [timeRange]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    // Auto-refresh every 30 seconds when enabled
    const interval = setInterval(fetchSystemHealth, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);


  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading system health...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-md">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">Health Check Failed</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!systemHealth) return null;

  return (
    <div className="flex flex-1 flex-col gap-2 p-3">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            <h1 className="text-lg font-bold">System Monitoring</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto px-4">
          {/* Time Range Selector */}
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Select value={timeRange} onValueChange={handleTimeRangeChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last Hour</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Export Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting}>
                <Download className="mr-1 h-3 w-3" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Auto-refresh Toggle */}
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${autoRefresh && refreshing ? 'animate-spin' : ''}`} />
            Auto
          </Button>

          {/* Manual Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {lastUpdate && (
            <span className="text-sm text-muted-foreground">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-2 p-1 sm:p-2 pt-0">
        {/* Horizontal Status Bar - All key metrics in one line */}
        <HorizontalStatusBar systemHealth={systemHealth} />

        {/* Two Column Layout */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Component Status Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Component Status
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <CompactStatusTable components={systemHealth.components} />
              </CardContent>
            </Card>

            {/* Performance Charts */}
            <ResourceUsageCharts metrics={systemHealth.metrics} />

            {/* Recovery Status */}
            <RecoveryStatus />
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* System Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  System Details
                </CardTitle>
                <CardDescription className="text-xs">
                  Detailed system resource usage and performance metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">Sessions</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total:</span>
                        <span>{systemHealth.metrics.totalSessions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active:</span>
                        <span>{systemHealth.metrics.activeSessions}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">Executions</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total:</span>
                        <span>{systemHealth.metrics.totalExecutions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active:</span>
                        <span>{systemHealth.metrics.activeExecutions}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">Resources</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">File Watchers:</span>
                        <span>{systemHealth.metrics.fileWatchers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active Locks:</span>
                        <span>{systemHealth.metrics.activeLocks}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">Memory</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Heap Used:</span>
                        <span className="font-mono">{systemHealth.metrics.memory.heapUsed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Heap Total:</span>
                        <span className="font-mono">{systemHealth.metrics.memory.heapTotal}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">External:</span>
                        <span className="font-mono">{systemHealth.metrics.memory.external}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">Disk Usage</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sessions:</span>
                        <span className="font-mono">{systemHealth.metrics.diskUsage.sessions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Executions:</span>
                        <span className="font-mono">{systemHealth.metrics.diskUsage.executions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Analytics:</span>
                        <span className="font-mono">{systemHealth.metrics.diskUsage.analytics}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">System Info</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Version:</span>
                        <span className="font-mono">{systemHealth.version}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Environment:</span>
                        <span className="font-mono">{systemHealth.environment}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Components:</span>
                        <span>{systemHealth.components.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Activity Feed */}
            <ActivityFeed />
          </div>
        </div>
      </div>
    </div>
  );
}