'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, XCircle, Activity, HardDrive, Server, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  components: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    details?: any;
    lastCheck: number;
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

export default function MonitoringStatusPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('Failed to fetch health status');
        const data = await response.json();
        setHealth(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'unhealthy':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500">Healthy</Badge>;
      case 'degraded':
        return <Badge className="bg-yellow-500">Degraded</Badge>;
      case 'unhealthy':
        return <Badge className="bg-red-500">Unhealthy</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const parseMemoryValue = (value: string): number => {
    const match = value.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-spin mx-auto mb-4" />
          <p>Loading monitoring status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!health) return null;

  const memoryUsed = parseMemoryValue(health.metrics.memory.heapUsed);
  const memoryTotal = parseMemoryValue(health.metrics.memory.heapTotal);
  const memoryPercent = memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Production Monitoring</h1>
          <p className="text-muted-foreground">
            System health and performance metrics
          </p>
        </div>
        <div className="text-right">
          {getStatusBadge(health.overall)}
          <p className="text-sm text-muted-foreground mt-1">
            v{health.version} • {health.environment}
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {getStatusIcon(health.overall)}
              <span className="text-2xl font-bold capitalize">{health.overall}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Uptime: {Math.floor(health.uptime / 1000)}s
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.metrics.activeSessions}</div>
            <p className="text-xs text-muted-foreground">
              {health.metrics.totalSessions} total sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memoryPercent.toFixed(1)}%</div>
            <Progress value={memoryPercent} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {health.metrics.memory.heapUsed} / {health.metrics.memory.heapTotal}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Executions</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.metrics.activeExecutions}</div>
            <p className="text-xs text-muted-foreground">
              {health.metrics.totalExecutions} total executions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Component Status */}
      <Tabs defaultValue="components" className="space-y-4">
        <TabsList>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="disk">Disk Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {health.components.map((component) => (
              <Card key={component.name}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="text-base">{component.name}</span>
                    {getStatusIcon(component.status)}
                  </CardTitle>
                  <CardDescription>{component.message}</CardDescription>
                </CardHeader>
                {component.details && (
                  <CardContent>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                      {JSON.stringify(component.details, null, 2)}
                    </pre>
                    <p className="text-xs text-muted-foreground mt-2">
                      Last check: {formatDistanceToNow(component.lastCheck, { addSuffix: true })}
                    </p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Total</dt>
                    <dd className="text-sm font-medium">{health.metrics.totalSessions}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Active</dt>
                    <dd className="text-sm font-medium">{health.metrics.activeSessions}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Executions</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Total</dt>
                    <dd className="text-sm font-medium">{health.metrics.totalExecutions}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Active</dt>
                    <dd className="text-sm font-medium">{health.metrics.activeExecutions}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">File Watchers</dt>
                    <dd className="text-sm font-medium">{health.metrics.fileWatchers}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Active Locks</dt>
                    <dd className="text-sm font-medium">{health.metrics.activeLocks}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="disk" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sessions Storage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{health.metrics.diskUsage.sessions}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Executions Storage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{health.metrics.diskUsage.executions}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Analytics Storage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{health.metrics.diskUsage.analytics}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Memory Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 md:grid-cols-3">
                <div>
                  <dt className="text-sm text-muted-foreground">Heap Used</dt>
                  <dd className="text-lg font-medium">{health.metrics.memory.heapUsed}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Heap Total</dt>
                  <dd className="text-lg font-medium">{health.metrics.memory.heapTotal}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">External</dt>
                  <dd className="text-lg font-medium">{health.metrics.memory.external}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}