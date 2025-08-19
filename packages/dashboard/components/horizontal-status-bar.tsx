"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Monitor,
  Zap,
  Activity,
  Cpu
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

interface HorizontalStatusBarProps {
  systemHealth: SystemHealth;
}

export function HorizontalStatusBar({ systemHealth }: HorizontalStatusBarProps) {
  const getOverallStatusIndicator = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <div className="relative inline-flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </div>
        );
      case 'warning':
        return (
          <div className="relative inline-flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
          </div>
        );
      case 'error':
        return (
          <div className="relative inline-flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </div>
        );
      default:
        return (
          <div className="relative inline-flex h-3 w-3">
            <span className="relative inline-flex rounded-full h-3 w-3 bg-gray-400"></span>
          </div>
        );
    }
  };

  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatUptime = (uptime: number) => {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const healthyComponents = systemHealth.components.filter(c => c.status === 'healthy').length;
  const warningComponents = systemHealth.components.filter(c => c.status === 'warning').length;
  const errorComponents = systemHealth.components.filter(c => c.status === 'error').length;

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg text-xs">
      {/* System Status */}
      <div className="flex items-center gap-2">
        {getOverallStatusIndicator(systemHealth.overall)}
        <span className={`text-xs font-medium ${
          systemHealth.overall === 'healthy' ? 'text-green-700' :
          systemHealth.overall === 'warning' ? 'text-yellow-700' :
          systemHealth.overall === 'error' ? 'text-red-700' : 'text-gray-700'
        }`}>
          System {systemHealth.overall === 'healthy' ? 'Online' : 
                  systemHealth.overall === 'warning' ? 'Degraded' :
                  systemHealth.overall === 'error' ? 'Offline' : 'Unknown'}
        </span>
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Component Health Summary */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Components:</span>
        <div className="flex items-center gap-1">
          <span className="text-green-700 font-medium">{healthyComponents}</span>
          <span className="text-muted-foreground text-xs">online</span>
        </div>
        {warningComponents > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-yellow-700 font-medium">{warningComponents}</span>
            <span className="text-muted-foreground text-xs">degraded</span>
          </div>
        )}
        {errorComponents > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-red-700 font-medium">{errorComponents}</span>
            <span className="text-muted-foreground text-xs">offline</span>
          </div>
        )}
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Uptime */}
      <div className="flex items-center gap-2">
        <Zap className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">Up:</span>
        <span className="font-medium">{formatUptime(systemHealth.uptime)}</span>
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Sessions */}
      <div className="flex items-center gap-2">
        <Activity className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">Sessions:</span>
        <span className="font-medium">
          {systemHealth.metrics.activeSessions}/{systemHealth.metrics.totalSessions}
        </span>
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Memory */}
      <div className="flex items-center gap-2">
        <Cpu className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">Memory:</span>
        <span className="font-medium">
          {systemHealth.metrics.memory.heapUsed}/{systemHealth.metrics.memory.heapTotal}
        </span>
      </div>

      {/* Environment Badge */}
      <div className="ml-auto">
        <Badge variant="outline" className="text-xs">
          {systemHealth.environment}
        </Badge>
      </div>
    </div>
  );
}