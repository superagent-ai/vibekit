'use client';

import { useState } from 'react';
import { Clipboard, AlertCircle, CheckCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ParsedServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface PasteServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddServers: (servers: ParsedServer[]) => Promise<void>;
}

export function PasteServerDialog({ open, onOpenChange, onAddServers }: PasteServerDialogProps) {
  const [snippet, setSnippet] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedServers, setParsedServers] = useState<ParsedServer[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const parseSnippet = (text: string): ParsedServer[] => {
    try {
      // Try to parse as JSON
      const data = JSON.parse(text);
      const servers: ParsedServer[] = [];

      // Check for mcpServers format (Claude Desktop format)
      if (data.mcpServers && typeof data.mcpServers === 'object') {
        for (const [name, config] of Object.entries(data.mcpServers)) {
          if (typeof config === 'object' && config !== null) {
            const serverConfig = config as any;
            servers.push({
              name,
              command: serverConfig.command || 'node',
              args: serverConfig.args || [],
              env: serverConfig.env || {},
            });
          }
        }
      }
      // Check for direct server object
      else if (data.command) {
        servers.push({
          name: data.name || 'imported-server',
          command: data.command,
          args: data.args || [],
          env: data.env || {},
        });
      }
      // Check for array of servers
      else if (Array.isArray(data)) {
        for (const item of data) {
          if (item.command) {
            servers.push({
              name: item.name || `imported-server-${servers.length + 1}`,
              command: item.command,
              args: item.args || [],
              env: item.env || {},
            });
          }
        }
      }

      return servers;
    } catch (e) {
      throw new Error('Invalid JSON format. Please paste a valid MCP server configuration.');
    }
  };

  const handlePaste = async () => {
    setError(null);
    setSuccessMessage(null);
    setParsedServers([]);

    if (!snippet.trim()) {
      setError('Please paste a server configuration snippet');
      return;
    }

    try {
      const servers = parseSnippet(snippet);
      
      if (servers.length === 0) {
        setError('No valid server configurations found in the snippet');
        return;
      }

      setParsedServers(servers);
      setSuccessMessage(`Found ${servers.length} server${servers.length > 1 ? 's' : ''} ready to import`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleImport = async () => {
    if (parsedServers.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(`Importing and connecting ${parsedServers.length} server${parsedServers.length > 1 ? 's' : ''}...`);

    try {
      await onAddServers(parsedServers);
      setSuccessMessage(`Successfully imported and connected ${parsedServers.length} server${parsedServers.length > 1 ? 's' : ''}`);
      
      // Reset and close after a short delay
      setTimeout(() => {
        setSnippet('');
        setParsedServers([]);
        setSuccessMessage(null);
        onOpenChange(false);
      }, 1500);
    } catch (e: any) {
      setError(`Failed to import servers: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setSnippet('');
    setError(null);
    setSuccessMessage(null);
    setParsedServers([]);
    onOpenChange(false);
  };

  const exampleSnippet = `{
  "mcpServers": {
    "time-mcp": {
      "command": "npx",
      "args": ["-y", "time-mcp"]
    },
    "weather-mcp": {
      "command": "npx",
      "args": ["-y", "weather-mcp"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clipboard className="h-5 w-5" />
            Paste MCP Server Configuration
          </DialogTitle>
          <DialogDescription>
            Paste an MCP server configuration snippet to quickly add and connect servers. 
            Supports Claude Desktop format and other common formats. Servers will be automatically connected after import.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Configuration Snippet</label>
            <Textarea
              value={snippet}
              onChange={(e) => setSnippet(e.target.value)}
              placeholder={exampleSnippet}
              className="mt-1 h-64 font-mono text-xs"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Paste your MCP server configuration in JSON format
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {parsedServers.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <h4 className="text-sm font-medium">Servers to Import:</h4>
              <ul className="space-y-1">
                {parsedServers.map((server, index) => (
                  <li key={index} className="text-sm flex items-center gap-2">
                    <span className="font-mono font-medium">{server.name}</span>
                    <span className="text-muted-foreground">→</span>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {server.command} {server.args?.join(' ')}
                    </code>
                  </li>
                ))}
              </ul>
              <div className="text-xs text-muted-foreground flex items-center gap-1 pt-2 border-t">
                <CheckCircle className="h-3 w-3" />
                <span>Servers will be automatically connected after import</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          {parsedServers.length === 0 ? (
            <Button onClick={handlePaste} disabled={!snippet.trim()}>
              Parse Snippet
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={isProcessing}>
              {isProcessing ? 'Importing & Connecting...' : `Import & Connect ${parsedServers.length} Server${parsedServers.length > 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}