import { useState } from "react";
import { ChevronDown, ChevronRight, Play, Code, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Tool {
  name: string;
  description?: string;
  inputSchema?: any;
}

interface ToolCardProps {
  tool: Tool;
  serverId: string;
  onExecute?: (serverId: string, toolName: string, params: any) => Promise<any>;
}

function parseSchema(schema: any): { params: Array<{ name: string; type: string; required: boolean; description?: string }> } {
  const params: Array<{ name: string; type: string; required: boolean; description?: string }> = [];
  
  if (!schema || !schema.properties) {
    return { params };
  }
  
  const required = schema.required || [];
  
  for (const [name, prop] of Object.entries(schema.properties)) {
    const propData = prop as any;
    let type = propData.type || 'any';
    
    // Handle array types
    if (type === 'array' && propData.items) {
      type = `array<${propData.items.type || 'any'}>`;
    }
    
    // Handle enum types
    if (propData.enum) {
      type = propData.enum.join(' | ');
    }
    
    params.push({
      name,
      type,
      required: required.includes(name),
      description: propData.description
    });
  }
  
  return { params };
}

export function ToolCard({ tool, serverId, onExecute }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [params, setParams] = useState('{}');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    if (!onExecute) return;
    
    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      let parsedParams = {};
      if (params.trim()) {
        parsedParams = JSON.parse(params);
      }
      
      const res = await onExecute(serverId, tool.name, parsedParams);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExecuting(false);
    }
  };

  const formatSchema = (schema: any) => {
    if (!schema) return 'No schema defined';
    return JSON.stringify(schema, null, 2);
  };

  const { params: schemaParams } = parseSchema(tool.inputSchema);

  return (
    <Card className="text-sm">
      <CardHeader 
        className="cursor-pointer py-1.5 px-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm flex items-center gap-1.5 leading-tight">
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 flex-shrink-0" />
              )}
              <span className="font-mono truncate">{tool.name}</span>
            </CardTitle>
            {tool.description && (
              <CardDescription className="mt-0.5 text-xs line-clamp-1 leading-tight">
                {tool.description}
              </CardDescription>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Tool</Badge>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-2 px-3 pb-2 pt-0">
          {tool.inputSchema && (
            <Tabs defaultValue="params" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-7">
                <TabsTrigger value="params" className="text-[11px] py-1">
                  <FileText className="mr-1 h-3 w-3" />
                  Parameters
                </TabsTrigger>
                <TabsTrigger value="schema" className="text-[11px] py-1">
                  <Code className="mr-1 h-3 w-3" />
                  Schema
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="params" className="mt-2">
                {schemaParams.length > 0 ? (
                  <div className="space-y-1">
                    {schemaParams.map((param) => (
                      <div key={param.name} className="flex items-start gap-2 text-xs">
                        <div className="flex items-center gap-1 min-w-0">
                          <code className="font-mono font-semibold">{param.name}</code>
                          {param.required && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                              required
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground">:</span>
                        <span className="text-muted-foreground font-mono">{param.type}</span>
                        {param.description && (
                          <>
                            <span className="text-muted-foreground">-</span>
                            <span className="text-muted-foreground flex-1">{param.description}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No parameters required</p>
                )}
              </TabsContent>
              
              <TabsContent value="schema" className="mt-2">
                <pre className="p-1.5 bg-muted rounded text-[10px] overflow-x-auto max-h-40 overflow-y-auto">
                  {formatSchema(tool.inputSchema)}
                </pre>
              </TabsContent>
            </Tabs>
          )}

          <div>
            <Label htmlFor={`params-${tool.name}`} className="text-xs">
              Parameters (JSON)
            </Label>
            <Textarea
              id={`params-${tool.name}`}
              value={params}
              onChange={(e) => setParams(e.target.value)}
              placeholder="{}"
              rows={2}
              className="font-mono text-xs mt-1"
            />
          </div>

          <Button
            onClick={handleExecute}
            disabled={isExecuting}
            size="sm"
            className="w-full h-8 text-xs"
          >
            {isExecuting ? (
              <>
                <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Executing...
              </>
            ) : (
              <>
                <Play className="mr-2 h-3 w-3" />
                Execute Tool
              </>
            )}
          </Button>

          {result && (
            <div>
              <Label className="text-xs font-medium text-green-600">Result</Label>
              <pre className="mt-1 p-2 bg-green-50 dark:bg-green-900/10 rounded text-[10px] overflow-x-auto max-h-32 overflow-y-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div>
              <Label className="text-xs font-medium text-red-600">Error</Label>
              <pre className="mt-1 p-2 bg-red-50 dark:bg-red-900/10 rounded text-[10px] text-red-600 max-h-32 overflow-y-auto">
                {error}
              </pre>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}