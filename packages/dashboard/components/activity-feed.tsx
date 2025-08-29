"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  PlayCircle,
  CheckCircle2,
  XCircle,
  UserPlus,
  UserMinus,
  AlertTriangle,
  Pause,
  RefreshCw,
  Wifi,
  WifiOff
} from "lucide-react";

interface ActivityEvent {
  id: string;
  type: 'execution_started' | 'execution_completed' | 'execution_failed' | 'session_created' | 'session_ended' | 'system_alert';
  timestamp: number;
  data: Record<string, any>;
  severity?: 'info' | 'warning' | 'error';
}

export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pausedEventsRef = useRef<ActivityEvent[]>([]);

  const connectToActivityStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setError(null);
    
    try {
      const eventSource = new EventSource('/api/monitoring/activity');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const activityEvent: ActivityEvent = JSON.parse(event.data);
          
          if (isPaused) {
            // Store events while paused
            pausedEventsRef.current.unshift(activityEvent);
          } else {
            // Add to live feed
            setEvents(prev => [activityEvent, ...prev].slice(0, 100)); // Keep last 100 events
          }
        } catch (error) {
          console.error('Failed to parse activity event:', error);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        setError('Connection lost. Attempting to reconnect...');
        
        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (!isPaused) {
            connectToActivityStream();
          }
        }, 5000);
      };
    } catch (error) {
      setError('Failed to connect to activity stream');
      setIsConnected(false);
    }
  };

  const handlePauseToggle = () => {
    if (isPaused) {
      // Resume: add paused events to the feed
      setEvents(prev => [...pausedEventsRef.current, ...prev].slice(0, 100));
      pausedEventsRef.current = [];
      setIsPaused(false);
      
      // Reconnect if needed
      if (!isConnected) {
        connectToActivityStream();
      }
    } else {
      // Pause
      setIsPaused(true);
    }
  };

  const handleReconnect = () => {
    connectToActivityStream();
  };

  useEffect(() => {
    connectToActivityStream();
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const getEventIcon = (type: string, severity?: string) => {
    switch (type) {
      case 'execution_started':
        return <PlayCircle className="h-4 w-4 text-blue-500" />;
      case 'execution_completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'execution_failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'session_created':
        return <UserPlus className="h-4 w-4 text-green-500" />;
      case 'session_ended':
        return <UserMinus className="h-4 w-4 text-gray-500" />;
      case 'system_alert':
        if (severity === 'error') return <XCircle className="h-4 w-4 text-red-500" />;
        if (severity === 'warning') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
        return <Activity className="h-4 w-4 text-blue-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventColor = (type: string, severity?: string) => {
    switch (type) {
      case 'execution_started':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'execution_completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'execution_failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'session_created':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'session_ended':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'system_alert':
        if (severity === 'error') return 'bg-red-100 text-red-800 border-red-200';
        if (severity === 'warning') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatEventTitle = (event: ActivityEvent) => {
    switch (event.type) {
      case 'execution_started':
        return `Execution started: ${event.data.taskId || 'Unknown task'}`;
      case 'execution_completed':
        return `Execution completed: ${event.data.taskId || 'Unknown task'}`;
      case 'execution_failed':
        return `Execution failed: ${event.data.taskId || 'Unknown task'}`;
      case 'session_created':
        return `New session created: ${event.data.agentName || 'Unknown agent'}`;
      case 'session_ended':
        return `Session ended: ${event.data.agentName || 'Unknown agent'}`;
      case 'system_alert':
        return event.data.message || 'System alert';
      default:
        return `Activity: ${event.type}`;
    }
  };

  const formatEventDescription = (event: ActivityEvent) => {
    const details: string[] = [];
    
    if (event.data.projectId) details.push(`Project: ${event.data.projectId}`);
    if (event.data.agentName) details.push(`Agent: ${event.data.agentName}`);
    if (event.data.duration) details.push(`Duration: ${Math.round(event.data.duration / 1000)}s`);
    if (event.data.exitCode !== undefined) details.push(`Exit: ${event.data.exitCode}`);
    
    return details.join(' • ');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Live Activity Feed
            </CardTitle>
            <CardDescription>
              Real-time system events and activities
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {isConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs text-muted-foreground">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handlePauseToggle}
            >
              {isPaused ? (
                <PlayCircle className="mr-1 h-3 w-3" />
              ) : (
                <Pause className="mr-1 h-3 w-3" />
              )}
              {isPaused ? 'Resume' : 'Pause'}
            </Button>
            
            {!isConnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReconnect}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Reconnect
              </Button>
            )}
          </div>
        </div>
        
        {/* Status indicators */}
        <div className="flex items-center gap-2 pt-2">
          <Badge variant="outline" className="text-xs">
            {events.length} events
          </Badge>
          {isPaused && pausedEventsRef.current.length > 0 && (
            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">
              {pausedEventsRef.current.length} paused
            </Badge>
          )}
          {error && (
            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
              {error}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {isConnected ? 'Waiting for activity...' : 'Connecting to activity feed...'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {events.map((event) => (
                <div
                  key={`${event.id}-${event.timestamp}`}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="mt-0.5">
                    {getEventIcon(event.type, event.severity)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">
                        {formatEventTitle(event)}
                      </span>
                      <Badge className={`text-xs ${getEventColor(event.type, event.severity)}`}>
                        {event.type.replace('_', ' ')}
                      </Badge>
                    </div>
                    
                    {formatEventDescription(event) && (
                      <p className="text-xs text-muted-foreground mb-1">
                        {formatEventDescription(event)}
                      </p>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}