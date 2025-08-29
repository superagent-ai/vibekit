"use client";

import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Server,
  Database,
  FileText,
  Activity,
  Shield,
  Cpu,
  HardDrive,
  Network
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ComponentHealth {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
  lastCheck?: number;
  errors?: string[];
}

interface CompactStatusTableProps {
  components: ComponentHealth[];
}

export function CompactStatusTable({ components }: CompactStatusTableProps) {
  const getStatusIndicator = (status: string) => {
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'healthy':
        return <span className="text-xs font-medium text-green-700">Online</span>;
      case 'warning':
        return <span className="text-xs font-medium text-yellow-700">Degraded</span>;
      case 'error':
        return <span className="text-xs font-medium text-red-700">Offline</span>;
      default:
        return <span className="text-xs font-medium text-gray-700">Unknown</span>;
    }
  };

  const getComponentIcon = (name: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'session manager': <Database className="h-3 w-3 text-muted-foreground" />,
      'execution history': <FileText className="h-3 w-3 text-muted-foreground" />,
      'session recovery': <Shield className="h-3 w-3 text-muted-foreground" />,
      'file watcher pool': <Activity className="h-3 w-3 text-muted-foreground" />,
      'safe file writer': <HardDrive className="h-3 w-3 text-muted-foreground" />,
      'analytics': <Activity className="h-3 w-3 text-muted-foreground" />,
      'monitoring system': <Cpu className="h-3 w-3 text-muted-foreground" />,
    };

    // Try to match component name
    for (const [key, icon] of Object.entries(iconMap)) {
      if (name.toLowerCase().includes(key)) {
        return icon;
      }
    }

    return <Server className="h-3 w-3 text-muted-foreground" />;
  };

  const getKeyMetric = (component: ComponentHealth): string => {
    if (!component.details) return 'OK';

    const details = component.details;
    
    // Extract the most relevant metric for each component type
    if (component.name.toLowerCase().includes('session manager')) {
      return `${details.activeSessions || 0} active`;
    } else if (component.name.toLowerCase().includes('execution')) {
      return `${details.totalExecutions || 0} total`;
    } else if (component.name.toLowerCase().includes('watcher')) {
      return `${details.totalWatchers || 0} watchers`;
    } else if (component.name.toLowerCase().includes('writer')) {
      return `${details.activeLocks || 0} locks`;
    } else if (component.name.toLowerCase().includes('recovery')) {
      return 'All OK';
    } else if (component.name.toLowerCase().includes('analytics')) {
      return details.enabled ? 'Enabled' : 'Disabled';
    }

    return 'Running';
  };

  const formatTooltipDetails = (component: ComponentHealth): string => {
    let content = `${component.name}\nStatus: ${component.status}\nMessage: ${component.message}`;
    
    if (component.lastCheck) {
      content += `\nLast Check: ${new Date(component.lastCheck).toLocaleString()}`;
    }

    if (component.details && Object.keys(component.details).length > 0) {
      content += '\n\nDetails:';
      Object.entries(component.details).forEach(([key, value]) => {
        content += `\n${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`;
      });
    }

    if (component.errors && component.errors.length > 0) {
      content += '\n\nErrors:';
      component.errors.forEach(error => {
        content += `\n• ${error}`;
      });
    }

    return content;
  };

  // Sort components: errors first, then warnings, then healthy
  const sortedComponents = [...components].sort((a, b) => {
    const statusOrder = { error: 0, warning: 1, healthy: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  return (
    <TooltipProvider>
      <div className="space-y-1">
        {sortedComponents.map((component) => (
          <Tooltip key={component.name}>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors cursor-default border border-transparent hover:border-muted">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {getStatusIndicator(component.status)}
                    {getStatusLabel(component.status)}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    {getComponentIcon(component.name)}
                    <span className="text-sm font-medium truncate">
                      {component.name}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap ml-3 font-mono">
                  {getKeyMetric(component)}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <pre className="text-xs whitespace-pre-wrap">
                {formatTooltipDetails(component)}
              </pre>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}