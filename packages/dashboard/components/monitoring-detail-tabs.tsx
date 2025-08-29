"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourceUsageCharts } from "@/components/resource-usage-charts";
import { RecoveryStatus } from "@/components/recovery-status";
import { ActivityFeed } from "@/components/activity-feed";
import { 
  Activity,
  BarChart3,
  Settings,
  Shield,
  Server
} from "lucide-react";

interface SystemHealth {
  overall: 'healthy' | 'warning' | 'error';
  timestamp: number;
  uptime: number;
  components: any[];
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

interface MonitoringDetailTabsProps {
  systemHealth: SystemHealth;
}

export function MonitoringDetailTabs({ systemHealth }: MonitoringDetailTabsProps) {
  return (
    <Tabs defaultValue="activity" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="activity" className="text-xs">
          <Activity className="h-3 w-3 mr-1" />
          Activity
        </TabsTrigger>
        <TabsTrigger value="performance" className="text-xs">
          <BarChart3 className="h-3 w-3 mr-1" />
          Performance
        </TabsTrigger>
        <TabsTrigger value="recovery" className="text-xs">
          <Shield className="h-3 w-3 mr-1" />
          Recovery
        </TabsTrigger>
        <TabsTrigger value="details" className="text-xs">
          <Settings className="h-3 w-3 mr-1" />
          Details
        </TabsTrigger>
      </TabsList>

      <TabsContent value="activity" className="mt-3">
        <ActivityFeed />
      </TabsContent>

      <TabsContent value="performance" className="mt-3">
        <ResourceUsageCharts metrics={systemHealth.metrics} />
      </TabsContent>

      <TabsContent value="recovery" className="mt-3">
        <RecoveryStatus />
      </TabsContent>

      <TabsContent value="details" className="mt-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="h-4 w-4" />
              System Metrics
            </CardTitle>
            <CardDescription className="text-xs">
              Detailed system resource usage and performance metrics
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
      </TabsContent>
    </Tabs>
  );
}