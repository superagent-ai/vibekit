"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

interface DashboardData {
  overview: {
    totalExecutions: number;
    activeExecutions: number;
    successRate: number;
    avgDuration: number;
    pullRequestsCreated: number;
    activeSessions: number;
    recoveredSessions: number;
  };
  recentExecutions: any[];
  statistics: {
    byAgent: Record<string, number>;
    bySandbox: Record<string, number>;
    byStatus: Record<string, number>;
    hourlyVolume: Array<{ hour: string; count: number; success: number; failed: number }>;
    dailyTrends: Array<{ date: string; executions: number; successRate: number; avgDuration: number }>;
  };
  performance?: {
    performance?: {
      requests: {
        total: number;
        avgDuration: string;
        p50: string;
        p90: string;
        p95: string;
        p99: string;
        throughput: string;
        errorRate: string;
      };
      resources: {
        cpu: string;
        memory: string;
        heapUsed: string;
        eventLoopLag: string;
        activeHandles: number;
      };
      bottlenecks: string[];
      slowestEndpoints: Array<{
        path: string;
        method: string;
        duration: string;
      }>;
    };
    uptime: number;
  };
  alerts: Array<{
    type: 'warning' | 'error' | 'info';
    message: string;
    timestamp: number;
    component?: string;
  }>;
  timestamp: number;
}

type TimeRange = '1h' | '24h' | '7d' | '30d';

export default function MonitoringPage() {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      
      // Fetch all data in parallel
      const [healthRes, dashboardRes, performanceRes] = await Promise.all([
        fetch('/api/health'),
        fetch(`/api/monitoring/dashboard?timeRange=${timeRange}`),
        fetch('/api/monitoring/performance').catch(() => null)
      ]);
      
      const health = await healthRes.json();
      const dashboard = dashboardRes ? await dashboardRes.json() : null;
      const performance = performanceRes ? await performanceRes.json() : null;
      
      if (!healthRes.ok) {
        throw new Error(health.error || 'Failed to fetch system health');
      }
      
      setSystemHealth(health);
      if (dashboard) {
        setDashboardData({
          ...dashboard,
          performance: performance?.metrics
        });
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch monitoring data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch monitoring data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleTimeRangeChange = (newRange: TimeRange) => {
    setTimeRange(newRange);
    fetchData();
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
    fetchData();
  }, [timeRange]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    // Auto-refresh every 30 seconds when enabled
    const interval = setInterval(fetchData, 30000);
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
    <TooltipProvider>
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Total:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Total number of sessions created since system start</p>
                          </TooltipContent>
                        </Tooltip>
                        <span>{systemHealth.metrics.totalSessions}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Active:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Number of currently active sessions</p>
                          </TooltipContent>
                        </Tooltip>
                        <span>{systemHealth.metrics.activeSessions}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">Executions</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Total:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Total number of task executions completed</p>
                          </TooltipContent>
                        </Tooltip>
                        <span>{systemHealth.metrics.totalExecutions}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Active:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Number of executions currently running</p>
                          </TooltipContent>
                        </Tooltip>
                        <span>{systemHealth.metrics.activeExecutions}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">Resources</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">File Watchers:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Number of active file system watchers monitoring for changes</p>
                          </TooltipContent>
                        </Tooltip>
                        <span>{systemHealth.metrics.fileWatchers}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Active Locks:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Number of active file locks preventing concurrent access</p>
                          </TooltipContent>
                        </Tooltip>
                        <span>{systemHealth.metrics.activeLocks}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">Memory</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Heap Used:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Memory currently allocated on the JavaScript heap</p>
                          </TooltipContent>
                        </Tooltip>
                        <span className="font-mono">{systemHealth.metrics.memory.heapUsed}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Heap Total:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Total size of the allocated heap</p>
                          </TooltipContent>
                        </Tooltip>
                        <span className="font-mono">{systemHealth.metrics.memory.heapTotal}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">External:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Memory usage of C++ objects bound to JavaScript objects</p>
                          </TooltipContent>
                        </Tooltip>
                        <span className="font-mono">{systemHealth.metrics.memory.external}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">Disk Usage</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Sessions:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Disk space used by session data and logs</p>
                          </TooltipContent>
                        </Tooltip>
                        <span className="font-mono">{systemHealth.metrics.diskUsage.sessions}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Executions:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Disk space used by execution history and artifacts</p>
                          </TooltipContent>
                        </Tooltip>
                        <span className="font-mono">{systemHealth.metrics.diskUsage.executions}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Analytics:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Disk space used by analytics and telemetry data</p>
                          </TooltipContent>
                        </Tooltip>
                        <span className="font-mono">{systemHealth.metrics.diskUsage.analytics}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">System Info</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Version:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Current version of the VibeKit system</p>
                          </TooltipContent>
                        </Tooltip>
                        <span className="font-mono">{systemHealth.version}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Environment:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Current deployment environment (development, production, etc.)</p>
                          </TooltipContent>
                        </Tooltip>
                        <span className="font-mono">{systemHealth.environment}</span>
                      </div>
                      <div className="flex justify-between">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">Components:</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Total number of system components being monitored</p>
                          </TooltipContent>
                        </Tooltip>
                        <span>{systemHealth.components.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics - New addition */}
            {dashboardData?.performance?.performance?.requests && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Performance Metrics
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Request performance and resource utilization
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium">Requests</h4>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">Total:</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Total number of HTTP requests processed</p>
                            </TooltipContent>
                          </Tooltip>
                          <span>{dashboardData.performance?.performance?.requests?.total || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">Avg Duration:</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Average response time across all requests</p>
                            </TooltipContent>
                          </Tooltip>
                          <span className="font-mono">{dashboardData.performance?.performance?.requests?.avgDuration || '0ms'}</span>
                        </div>
                        <div className="flex justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">P95:</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>95th percentile response time (95% of requests are faster)</p>
                            </TooltipContent>
                          </Tooltip>
                          <span className="font-mono">{dashboardData.performance?.performance?.requests?.p95 || '0ms'}</span>
                        </div>
                        <div className="flex justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">Error Rate:</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Percentage of requests that resulted in errors</p>
                            </TooltipContent>
                          </Tooltip>
                          <span className="font-mono">{dashboardData.performance?.performance?.requests?.errorRate || '0%'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-medium">Resources</h4>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">CPU:</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Current CPU usage percentage</p>
                            </TooltipContent>
                          </Tooltip>
                          <span className="font-mono">{dashboardData.performance?.performance?.resources?.cpu || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">Memory:</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Current memory usage percentage</p>
                            </TooltipContent>
                          </Tooltip>
                          <span className="font-mono">{dashboardData.performance?.performance?.resources?.memory || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">Event Loop:</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Event loop delay indicating Node.js performance</p>
                            </TooltipContent>
                          </Tooltip>
                          <span className="font-mono">{dashboardData.performance?.performance?.resources?.eventLoopLag || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">Handles:</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Number of active handles (file descriptors, sockets, etc.)</p>
                            </TooltipContent>
                          </Tooltip>
                          <span>{dashboardData.performance?.performance?.resources?.activeHandles || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Activity Feed */}
            <ActivityFeed />
          </div>
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
}