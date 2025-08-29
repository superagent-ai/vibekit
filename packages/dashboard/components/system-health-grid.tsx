"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Server,
  Database,
  FileText,
  Activity,
  Shield,
  Cpu,
  HardDrive,
  Network
} from "lucide-react";
import { useState, useEffect } from "react";

interface ComponentHealth {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
  lastCheck?: number;
  errors?: string[];
}

interface SystemHealthGridProps {
  components: ComponentHealth[];
}

export function SystemHealthGrid({ components }: SystemHealthGridProps) {
  // Start with all components expanded by default
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());

  // Initialize expanded state when components change
  useEffect(() => {
    // For the initial load, don't expand anything by default to keep it clean
    setExpandedComponents(new Set());
  }, [components]);

  const getStatusIcon = (status: string, size = "h-4 w-4") => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className={`${size} text-green-500`} />;
      case 'warning':
        return <AlertTriangle className={`${size} text-yellow-500`} />;
      case 'error':
        return <XCircle className={`${size} text-red-500`} />;
      default:
        return <Server className={`${size} text-gray-500`} />;
    }
  };

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="text-sm font-medium text-green-700">Operational</span>
          </div>
        );
      case 'warning':
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></div>
            <span className="text-sm font-medium text-yellow-700">Degraded</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-sm font-medium text-red-700">Down</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-gray-500"></div>
            <span className="text-sm font-medium text-gray-700">Unknown</span>
          </div>
        );
    }
  };

  const getStatusColor = (status: string) => {
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

  const getComponentIcon = (name: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'SessionManager': <Database className="h-4 w-4" />,
      'ExecutionHistoryManager': <FileText className="h-4 w-4" />,
      'SessionRecovery': <Shield className="h-4 w-4" />,
      'FileWatcherPool': <Activity className="h-4 w-4" />,
      'SafeFileWriter': <HardDrive className="h-4 w-4" />,
      'AgentAnalytics': <Activity className="h-4 w-4" />,
      'System': <Cpu className="h-4 w-4" />,
      'Network': <Network className="h-4 w-4" />,
    };

    // Try to match component name
    for (const [key, icon] of Object.entries(iconMap)) {
      if (name.toLowerCase().includes(key.toLowerCase())) {
        return icon;
      }
    }

    return <Server className="h-4 w-4" />;
  };

  const toggleComponent = (componentName: string) => {
    const newExpanded = new Set(expandedComponents);
    if (newExpanded.has(componentName)) {
      newExpanded.delete(componentName);
    } else {
      newExpanded.add(componentName);
    }
    setExpandedComponents(newExpanded);
  };

  const healthyComponents = components.filter(c => c.status === 'healthy');
  const warningComponents = components.filter(c => c.status === 'warning');
  const errorComponents = components.filter(c => c.status === 'error');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Component Health
        </CardTitle>
        <CardDescription>
          Status of all system components and services
        </CardDescription>
        
        {/* Summary badges and controls */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
              {healthyComponents.length} Healthy
            </Badge>
            {warningComponents.length > 0 && (
              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">
                {warningComponents.length} Warning
              </Badge>
            )}
            {errorComponents.length > 0 && (
              <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
                {errorComponents.length} Error
              </Badge>
            )}
          </div>
          
          {/* Show/hide toggle for components with extended details */}
          {components.some(c => Object.keys(c.details || {}).length > 2) && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                const componentsWithManyDetails = components
                  .filter(c => Object.keys(c.details || {}).length > 2)
                  .map(c => c.name);
                
                const allExpanded = componentsWithManyDetails.every(name => 
                  expandedComponents.has(name)
                );
                
                if (allExpanded) {
                  // Collapse all
                  setExpandedComponents(new Set());
                } else {
                  // Expand all
                  setExpandedComponents(new Set(componentsWithManyDetails));
                }
              }}
              className="text-xs"
            >
              {components
                .filter(c => Object.keys(c.details || {}).length > 2)
                .every(c => expandedComponents.has(c.name)) 
                ? 'Collapse All' 
                : 'Expand All'
              }
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {/* Error components first */}
          {errorComponents.map((component) => (
            <ComponentItem
              key={component.name}
              component={component}
              isExpanded={expandedComponents.has(component.name)}
              onToggle={() => toggleComponent(component.name)}
              getStatusIcon={getStatusIcon}
              getStatusColor={getStatusColor}
              getComponentIcon={getComponentIcon}
            />
          ))}
          
          {/* Warning components second */}
          {warningComponents.map((component) => (
            <ComponentItem
              key={component.name}
              component={component}
              isExpanded={expandedComponents.has(component.name)}
              onToggle={() => toggleComponent(component.name)}
              getStatusIcon={getStatusIcon}
              getStatusColor={getStatusColor}
              getComponentIcon={getComponentIcon}
            />
          ))}
          
          {/* Healthy components last */}
          {healthyComponents.map((component) => (
            <ComponentItem
              key={component.name}
              component={component}
              isExpanded={expandedComponents.has(component.name)}
              onToggle={() => toggleComponent(component.name)}
              getStatusIcon={getStatusIcon}
              getStatusColor={getStatusColor}
              getComponentIcon={getComponentIcon}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ComponentItemProps {
  component: ComponentHealth;
  isExpanded: boolean;
  onToggle: () => void;
  getStatusIcon: (status: string, size?: string) => React.ReactNode;
  getStatusColor: (status: string) => string;
  getComponentIcon: (name: string) => React.ReactNode;
}

function ComponentItem({
  component,
  isExpanded,
  onToggle,
  getStatusIcon,
  getStatusColor,
  getComponentIcon
}: ComponentItemProps) {
  const hasDetails = component.details || component.errors?.length;

  return (
    <div className="border rounded-lg h-fit">
      <div className="p-3">
        {/* Header with status */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {getComponentIcon(component.name)}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{component.name}</div>
              <div className="text-xs text-muted-foreground truncate">{component.message}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-1 ml-2">
            <div className={`h-2 w-2 rounded-full ${
              component.status === 'healthy' ? 'bg-green-500' :
              component.status === 'warning' ? 'bg-yellow-500 animate-pulse' :
              component.status === 'error' ? 'bg-red-500 animate-pulse' : 'bg-gray-500'
            }`}></div>
            {getStatusIcon(component.status, "h-3 w-3")}
          </div>
        </div>

        {/* Compact details - show only most important ones */}
        {component.details && Object.keys(component.details).length > 0 && (
          <div className="space-y-1 text-xs">
            {Object.entries(component.details)
              .filter(([key]) => {
                // Show only the most relevant metrics
                const importantKeys = ['totalsessions', 'activesessions', 'totalexecutions', 'activeexecutions', 'totalwatchers', 'activelocks', 'successrate'];
                return importantKeys.some(important => key.toLowerCase().includes(important));
              })
              .slice(0, 2) // Show only top 2 most important metrics
              .map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-muted-foreground">
                  {key.replace(/([A-Z])/g, ' $1').replace(/total|active/gi, '').trim()}:
                </span>
                <span className="font-mono">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Toggle for full details if there are many */}
        {hasDetails && Object.keys(component.details || {}).length > 2 && (
          <div className="mt-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onToggle}
              className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Less
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3 mr-1" />
                  More
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Expanded details - only show if there are more than 2 details or errors */}
      {hasDetails && (Object.keys(component.details || {}).length > 2 || component.errors?.length) && (
        <Collapsible open={isExpanded}>
          <CollapsibleContent>
            <div className="border-t p-2 bg-muted/30">
              {/* All details */}
              {component.details && Object.keys(component.details).length > 0 && (
                <div className="mb-2">
                  <h4 className="text-xs font-medium mb-1">Full Details</h4>
                  <div className="grid gap-1 text-xs">
                    {Object.entries(component.details)
                      .filter(([key]) => !['enabled', 'available'].includes(key.toLowerCase()))
                      .map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}:
                        </span>
                        <span className="font-mono">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {component.errors && component.errors.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium mb-1 text-red-600">Errors</h4>
                  <div className="space-y-1">
                    {component.errors.map((error, index) => (
                      <div key={index} className="text-xs bg-red-50 border border-red-200 rounded p-2">
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}