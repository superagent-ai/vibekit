"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ServerFormData {
  name: string;
  description?: string;
  transport: 'stdio' | 'sse' | 'http';
  config: {
    // Stdio
    command?: string;
    args?: string;
    env?: string;
    cwd?: string;
    // HTTP/SSE
    url?: string;
    headers?: string;
  };
}

interface ServerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ServerFormData) => Promise<void>;
  initialData?: Partial<ServerFormData>;
  mode?: 'create' | 'edit';
}

export function ServerForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  initialData,
  mode = 'create' 
}: ServerFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<ServerFormData>({
    name: '',
    description: '',
    transport: 'stdio',
    config: {},
  });

  // Update form data when initialData changes or when dialog opens
  useEffect(() => {
    if (open && initialData) {
      // Process config data for display
      const processedConfig: any = {};
      
      if (initialData.transport === 'stdio' && initialData.config) {
        processedConfig.command = initialData.config.command || '';
        // Convert args array back to comma-separated string for editing
        processedConfig.args = Array.isArray(initialData.config.args) 
          ? initialData.config.args.join(', ') 
          : initialData.config.args || '';
        // Convert env object to JSON string for editing
        processedConfig.env = initialData.config.env 
          ? JSON.stringify(initialData.config.env, null, 2) 
          : '';
        processedConfig.cwd = initialData.config.cwd || '';
      } else if ((initialData.transport === 'sse' || initialData.transport === 'http') && initialData.config) {
        processedConfig.url = initialData.config.url || '';
        // Convert headers object to JSON string for editing
        processedConfig.headers = initialData.config.headers 
          ? JSON.stringify(initialData.config.headers, null, 2) 
          : '';
      }

      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        transport: initialData.transport || 'stdio',
        config: processedConfig,
      });
    } else if (open && !initialData) {
      // Reset form for create mode
      setFormData({
        name: '',
        description: '',
        transport: 'stdio',
        config: {},
      });
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Parse JSON fields
      const processedData = { ...formData };
      
      if (formData.transport === 'stdio') {
        // Parse args as array - handle various formats
        if (formData.config.args) {
          let args: string[] = [];
          const input = formData.config.args.trim();
          
          // Check if it's already a JSON array
          if (input.startsWith('[') && input.endsWith(']')) {
            try {
              args = JSON.parse(input);
            } catch {
              // If JSON parse fails, treat as comma-separated
              args = input.slice(1, -1).split(',').map(s => s.trim());
            }
          } else {
            // Split by comma, but be smart about quotes
            const parts: string[] = [];
            let current = '';
            let inQuotes = false;
            let quoteChar = '';
            
            for (let i = 0; i < input.length; i++) {
              const char = input[i];
              
              if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
              } else if (inQuotes && char === quoteChar) {
                inQuotes = false;
                quoteChar = '';
              } else if (!inQuotes && char === ',') {
                if (current.trim()) {
                  parts.push(current.trim());
                }
                current = '';
              } else {
                current += char;
              }
            }
            
            // Add the last part
            if (current.trim()) {
              parts.push(current.trim());
            }
            
            // Clean up each part
            args = parts.map(part => {
              part = part.trim();
              // Remove surrounding quotes if present
              if ((part.startsWith('"') && part.endsWith('"')) || 
                  (part.startsWith("'") && part.endsWith("'"))) {
                return part.slice(1, -1);
              }
              return part;
            }).filter(Boolean);
          }
          
          processedData.config.args = args as any;
        }
        // Parse env as object
        if (formData.config.env && formData.config.env.trim()) {
          try {
            processedData.config.env = JSON.parse(formData.config.env) as any;
          } catch {
            alert('Invalid JSON in environment variables');
            setIsLoading(false);
            return;
          }
        } else {
          // Remove empty env
          delete processedData.config.env;
        }
        
        // Remove empty cwd
        if (!formData.config.cwd || !formData.config.cwd.trim()) {
          delete processedData.config.cwd;
        }
      } else {
        // Parse headers as object for HTTP/SSE
        if (formData.config.headers) {
          try {
            processedData.config.headers = JSON.parse(formData.config.headers) as any;
          } catch {
            alert('Invalid JSON in headers');
            setIsLoading(false);
            return;
          }
        }
      }

      await onSubmit(processedData);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to submit:', error);
      alert('Failed to save server configuration');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Add MCP Server' : 'Edit MCP Server'}
            </DialogTitle>
            <DialogDescription>
              Configure an MCP server to connect to. The server will provide tools and resources.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My MCP Server"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does this server do?"
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transport">Transport</Label>
              <Select
                value={formData.transport}
                onValueChange={(value: any) => setFormData({ ...formData, transport: value, config: {} })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">Standard I/O (stdio)</SelectItem>
                  <SelectItem value="sse">Server-Sent Events (SSE)</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.transport === 'stdio' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="command">Command</Label>
                  <Input
                    id="command"
                    value={formData.config.command || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      config: { ...formData.config, command: e.target.value }
                    })}
                    placeholder="node"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="args">Arguments (comma-separated)</Label>
                  <Input
                    id="args"
                    value={formData.config.args || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      config: { ...formData.config, args: e.target.value }
                    })}
                    placeholder="-y, --package=task-master-ai, task-master-ai"
                  />
                  <p className="text-xs text-muted-foreground">
                    For npx: -y, --package=package-name, package-name
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="env">Environment Variables (JSON)</Label>
                  <Textarea
                    id="env"
                    value={formData.config.env || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      config: { ...formData.config, env: e.target.value }
                    })}
                    placeholder='{"ANTHROPIC_API_KEY": "your-key", "OPENAI_API_KEY": "your-key"}'
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Add any API keys or environment variables required by the MCP server
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="cwd">Working Directory (optional)</Label>
                  <Input
                    id="cwd"
                    value={formData.config.cwd || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      config: { ...formData.config, cwd: e.target.value }
                    })}
                    placeholder="/path/to/server"
                  />
                </div>
              </>
            )}

            {(formData.transport === 'sse' || formData.transport === 'http') && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    type="url"
                    value={formData.config.url || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      config: { ...formData.config, url: e.target.value }
                    })}
                    placeholder="http://localhost:3000/mcp"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="headers">Headers (JSON, optional)</Label>
                  <Textarea
                    id="headers"
                    value={formData.config.headers || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      config: { ...formData.config, headers: e.target.value }
                    })}
                    placeholder='{"Authorization": "Bearer token"}'
                    rows={2}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : mode === 'create' ? 'Add Server' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}