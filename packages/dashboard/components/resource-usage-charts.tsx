"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";
import {
  HardDrive,
  Cpu,
  Database,
  Activity,
  FileText
} from "lucide-react";

interface ResourceUsageChartsProps {
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
}

export function ResourceUsageCharts({ metrics }: ResourceUsageChartsProps) {
  // Parse memory values (remove MB/GB and convert to numbers)
  const parseMemoryValue = (value: string): number => {
    const match = value.match(/^([\d.]+)\s*(MB|GB)$/);
    if (!match) return 0;
    
    const num = parseFloat(match[1]);
    const unit = match[2];
    
    return unit === 'GB' ? num * 1024 : num; // Convert to MB
  };

  const heapUsed = parseMemoryValue(metrics.memory.heapUsed);
  const heapTotal = parseMemoryValue(metrics.memory.heapTotal);
  const external = parseMemoryValue(metrics.memory.external);
  
  const memoryUsagePercent = heapTotal > 0 ? (heapUsed / heapTotal) * 100 : 0;

  // Prepare data for charts
  const sessionData = [
    { name: 'Active', value: metrics.activeSessions, color: '#10B981' },
    { name: 'Inactive', value: metrics.totalSessions - metrics.activeSessions, color: '#6B7280' }
  ];

  const executionData = [
    { name: 'Active', value: metrics.activeExecutions, color: '#3B82F6' },
    { name: 'Completed', value: metrics.totalExecutions - metrics.activeExecutions, color: '#94A3B8' }
  ];

  const resourceData = [
    { name: 'File Watchers', value: metrics.fileWatchers, color: '#8B5CF6' },
    { name: 'Active Locks', value: metrics.activeLocks, color: '#F59E0B' }
  ];

  const diskUsageData = [
    { name: 'Sessions', usage: metrics.diskUsage.sessions, color: '#EF4444' },
    { name: 'Executions', usage: metrics.diskUsage.executions, color: '#10B981' },
    { name: 'Analytics', usage: metrics.diskUsage.analytics, color: '#3B82F6' }
  ];

  const formatBytes = (bytes: string) => {
    // If already formatted, return as is
    if (bytes.includes('MB') || bytes.includes('GB') || bytes.includes('KB')) {
      return bytes;
    }
    // Otherwise try to parse as number and format
    const num = parseInt(bytes);
    if (isNaN(num)) return bytes;
    
    if (num >= 1024 * 1024 * 1024) {
      return `${(num / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    } else if (num >= 1024 * 1024) {
      return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    } else if (num >= 1024) {
      return `${(num / 1024).toFixed(1)} KB`;
    }
    return `${num} B`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-md p-3 shadow-lg">
          <p className="text-foreground font-medium mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs text-foreground flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span>{entry.dataKey}: {entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Memory Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            Memory Usage
          </CardTitle>
          <CardDescription>
            Current heap memory consumption
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>Heap Used</span>
              <span className="font-mono">{metrics.memory.heapUsed} / {metrics.memory.heapTotal}</span>
            </div>
            <Progress value={memoryUsagePercent} className="h-2" />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Used:</span>
                <span className="font-mono">{metrics.memory.heapUsed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">External:</span>
                <span className="font-mono">{metrics.memory.external}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Sessions & Executions
          </CardTitle>
          <CardDescription>
            Active vs inactive sessions and executions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* Sessions pie chart */}
            <div className="text-center">
              <h4 className="text-sm font-medium mb-2">Sessions</h4>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={sessionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={50}
                    dataKey="value"
                  >
                    {sessionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-xs text-muted-foreground">
                {metrics.activeSessions} / {metrics.totalSessions} active
              </div>
            </div>

            {/* Executions pie chart */}
            <div className="text-center">
              <h4 className="text-sm font-medium mb-2">Executions</h4>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={executionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={50}
                    dataKey="value"
                  >
                    {executionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-xs text-muted-foreground">
                {metrics.activeExecutions} / {metrics.totalExecutions} active
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resource Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            System Resources
          </CardTitle>
          <CardDescription>
            File watchers and active locks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={resourceData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                fontSize={12}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                fontSize={12}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="value" 
                radius={[4, 4, 0, 0]}
                fill="#8B5CF6"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Disk Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4" />
            Disk Usage
          </CardTitle>
          <CardDescription>
            Storage used by different components
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {diskUsageData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm">{item.name}</span>
                </div>
                <span className="text-sm font-mono">{formatBytes(item.usage)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}