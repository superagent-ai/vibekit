"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DockerStatus {
  dockerInstalled: boolean;
  dockerRunning: boolean;
  dockerVersion: string | null;
  error: string | null;
}

interface DockerStatusIndicatorProps {
  className?: string;
  showDetails?: boolean;
  onStatusChange?: (status: DockerStatus) => void;
}

export function DockerStatusIndicator({ 
  className, 
  showDetails = false,
  onStatusChange 
}: DockerStatusIndicatorProps) {
  const [status, setStatus] = useState<DockerStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  
  const checkDockerStatus = async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/docker/status');
      const data = await response.json();
      setStatus(data);
      setLastCheck(new Date());
      onStatusChange?.(data);
    } catch (error) {
      console.error('Failed to check Docker status:', error);
      setStatus({
        dockerInstalled: false,
        dockerRunning: false,
        dockerVersion: null,
        error: 'Failed to check Docker status'
      });
    } finally {
      setIsChecking(false);
    }
  };
  
  useEffect(() => {
    // Initial check
    checkDockerStatus();
    
    // Check every 30 seconds
    const interval = setInterval(checkDockerStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  if (!status && !isChecking) {
    return null;
  }
  
  const getStatusIcon = () => {
    if (isChecking) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (!status?.dockerInstalled) {
      return <XCircle className="h-4 w-4" />;
    }
    if (!status?.dockerRunning) {
      return <AlertCircle className="h-4 w-4" />;
    }
    return <CheckCircle2 className="h-4 w-4" />;
  };
  
  const getStatusColor = () => {
    if (!status?.dockerInstalled) {
      return "text-red-600 bg-red-50 border-red-200";
    }
    if (!status?.dockerRunning) {
      return "text-yellow-600 bg-yellow-50 border-yellow-200";
    }
    return "text-green-600 bg-green-50 border-green-200";
  };
  
  const getStatusText = () => {
    if (isChecking) {
      return "Checking...";
    }
    if (!status?.dockerInstalled) {
      return "Docker Not Installed";
    }
    if (!status?.dockerRunning) {
      return "Docker Not Running";
    }
    return "Docker Running";
  };
  
  const getTooltipContent = () => {
    if (!status) return "Checking Docker status...";
    
    if (!status.dockerInstalled) {
      return (
        <div className="space-y-2">
          <p className="font-semibold">Docker is not installed</p>
          <p className="text-xs">Install Docker Desktop from docker.com to use Dagger sandbox</p>
        </div>
      );
    }
    
    if (!status.dockerRunning) {
      return (
        <div className="space-y-2">
          <p className="font-semibold">Docker is not running</p>
          <p className="text-xs">Start Docker Desktop to use Dagger sandbox</p>
          {status.dockerVersion && (
            <p className="text-xs text-muted-foreground">Version: {status.dockerVersion}</p>
          )}
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        <p className="font-semibold">Docker is running</p>
        {status.dockerVersion && (
          <p className="text-xs text-muted-foreground">Version: {status.dockerVersion}</p>
        )}
        {lastCheck && (
          <p className="text-xs text-muted-foreground">
            Last checked: {lastCheck.toLocaleTimeString()}
          </p>
        )}
      </div>
    );
  };
  
  if (!showDetails) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("inline-flex items-center gap-2", className)}>
              <Badge 
                variant="outline" 
                className={cn("gap-1 text-xs", getStatusColor())}
              >
                {getStatusIcon()}
                Docker
              </Badge>
              {!isChecking && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={checkDockerStatus}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>{getTooltipContent()}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <div className={cn("rounded-lg border p-4 space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-medium text-sm">{getStatusText()}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={checkDockerStatus}
          disabled={isChecking}
        >
          <RefreshCw className={cn("h-4 w-4", isChecking && "animate-spin")} />
        </Button>
      </div>
      
      {status?.error && (
        <div className="text-xs text-muted-foreground">
          {status.error}
        </div>
      )}
      
      {status?.dockerVersion && (
        <div className="text-xs text-muted-foreground">
          Version: {status.dockerVersion}
        </div>
      )}
      
      {!status?.dockerInstalled && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Docker is required for the Dagger sandbox provider.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => window.open('https://www.docker.com/products/docker-desktop', '_blank')}
          >
            Install Docker Desktop
          </Button>
        </div>
      )}
      
      {status?.dockerInstalled && !status?.dockerRunning && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Please start Docker Desktop to use the Dagger sandbox.
          </p>
        </div>
      )}
    </div>
  );
}