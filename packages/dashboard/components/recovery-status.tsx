"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  RotateCcw,
  Zap
} from "lucide-react";

interface RecoveryMetrics {
  activeRecoveries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  circuitBreakerStates: Record<string, 'closed' | 'open' | 'half-open'>;
  checkpointCount: number;
  averageRecoveryTime: number;
  strategySuccessRates: Record<string, number>;
}

interface RecoveryStatusProps {
  className?: string;
}

export function RecoveryStatus({ className }: RecoveryStatusProps) {
  const [metrics, setMetrics] = useState<RecoveryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecoveryMetrics = async () => {
    try {
      setError(null);
      const response = await fetch('/api/recovery/metrics');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch recovery metrics');
      }
      
      setMetrics(data.metrics);
    } catch (error) {
      console.error('Failed to fetch recovery metrics:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch recovery metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecoveryMetrics();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchRecoveryMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const getCircuitBreakerStatusColor = (state: string) => {
    switch (state) {
      case 'closed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'half-open':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'open':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCircuitBreakerIcon = (state: string) => {
    switch (state) {
      case 'closed':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'half-open':
        return <AlertCircle className="h-3 w-3" />;
      case 'open':
        return <XCircle className="h-3 w-3" />;
      default:
        return <Activity className="h-3 w-3" />;
    }
  };

  const calculateSuccessRate = () => {
    if (!metrics) return 0;
    const total = metrics.successfulRecoveries + metrics.failedRecoveries;
    return total > 0 ? (metrics.successfulRecoveries / total) * 100 : 0;
  };

  const formatTime = (milliseconds: number) => {
    if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
    if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`;
    return `${(milliseconds / 60000).toFixed(1)}m`;
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Recovery Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Recovery Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <XCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {error || 'Failed to load recovery metrics'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const successRate = calculateSuccessRate();
  
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Recovery Status
        </CardTitle>
        <CardDescription>
          Error recovery and system resilience metrics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Recovery Overview */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold">{metrics.activeRecoveries}</p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Successful</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{metrics.successfulRecoveries}</p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-muted-foreground">Failed</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{metrics.failedRecoveries}</p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-muted-foreground">Avg Time</span>
            </div>
            <p className="text-2xl font-bold">{formatTime(metrics.averageRecoveryTime)}</p>
          </div>
        </div>

        {/* Success Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Recovery Success Rate</span>
            <span className="text-sm text-muted-foreground">{successRate.toFixed(1)}%</span>
          </div>
          <Progress value={successRate} className="h-2" />
        </div>

        {/* Circuit Breakers */}
        {Object.keys(metrics.circuitBreakerStates).length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Circuit Breakers
            </h4>
            <div className="grid gap-2">
              {Object.entries(metrics.circuitBreakerStates).map(([service, state]) => (
                <div key={service} className="flex items-center justify-between">
                  <span className="text-sm">{service}</span>
                  <Badge className={`text-xs ${getCircuitBreakerStatusColor(state)}`}>
                    {getCircuitBreakerIcon(state)}
                    <span className="ml-1 capitalize">{state}</span>
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recovery Strategies */}
        {Object.keys(metrics.strategySuccessRates).length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Strategy Success Rates
            </h4>
            <div className="space-y-2">
              {Object.entries(metrics.strategySuccessRates).map(([strategy, rate]) => (
                <div key={strategy} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm capitalize">{strategy.replace('_', ' ')}</span>
                    <span className="text-sm text-muted-foreground">{(rate * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={rate * 100} className="h-1" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checkpoints */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">Recovery Checkpoints</span>
          <span className="text-sm font-medium">{metrics.checkpointCount}</span>
        </div>
      </CardContent>
    </Card>
  );
}