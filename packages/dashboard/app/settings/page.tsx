"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Shield, BarChart3, Link, RefreshCw, Bot, Server, FileText, Cpu, Package, Code, ChevronsUpDown, Check, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SUPPORTED_EDITORS } from "@/lib/editor-utils";

// Match the exact structure from cli.js readSettings()
interface VibeKitSettings {
  sandbox: {
    enabled: boolean;
    type: string;
  };
  proxy: {
    enabled: boolean;
    redactionEnabled: boolean;
  };
  analytics: {
    enabled: boolean;
  };
  aliases: {
    enabled: boolean;
  };
  agents?: {
    defaultAgent: string;
    defaultSandbox: string;
    dockerHubUser?: string;
  };
  registry?: {
    type: string;
    username?: string;
  };
  system?: {
    port: number;
    logLevel: string;
  };
  resources?: {
    maxConcurrentExecutions: number;
    monitoringRefreshInterval: number;
  };
  editor?: {
    defaultEditor: string;
    customCommand: string;
    autoDetect: boolean;
    openInNewWindow: boolean;
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [testingEditor, setTestingEditor] = useState(false);
  const [settings, setSettings] = useState<VibeKitSettings>({
    sandbox: {
      enabled: false,
      type: 'docker',
    },
    proxy: {
      enabled: true,
      redactionEnabled: true,
    },
    analytics: {
      enabled: true,
    },
    aliases: {
      enabled: false,
    },
    agents: {
      defaultAgent: 'claude',
      defaultSandbox: 'dagger',
    },
    registry: {
      type: 'docker-hub',
      username: '',
    },
    system: {
      port: 3001,
      logLevel: 'info',
    },
    resources: {
      maxConcurrentExecutions: 10,
      monitoringRefreshInterval: 30,
    },
    editor: {
      defaultEditor: 'vscode',
      customCommand: '',
      autoDetect: true,
      openInNewWindow: false,
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const loadedSettings = await response.json();
        setSettings(loadedSettings);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: VibeKitSettings) => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newSettings),
      });

      if (response.ok) {
        setSettings(newSettings);
      } else {
        throw new Error("Failed to save settings");
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (category: keyof VibeKitSettings, setting: string) => {
    const categorySettings = settings[category];
    if (!categorySettings) return;
    
    const newSettings = {
      ...settings,
      [category]: {
        ...categorySettings,
        [setting]:
          !categorySettings[
            setting as keyof typeof categorySettings
          ],
      },
    };
    saveSettings(newSettings);
  };

  const handleAgentChange = (agent: string) => {
    const newSettings = {
      ...settings,
      agents: {
        defaultAgent: agent,
        defaultSandbox: settings.agents?.defaultSandbox || 'dagger',
        dockerHubUser: settings.agents?.dockerHubUser,
      },
    };
    saveSettings(newSettings);
  };

  const handleSandboxChange = (sandbox: string) => {
    const newSettings = {
      ...settings,
      agents: {
        defaultAgent: settings.agents?.defaultAgent || 'claude',
        defaultSandbox: sandbox,
        dockerHubUser: settings.agents?.dockerHubUser,
      },
    };
    saveSettings(newSettings);
  };

  const handleRegistryChange = (field: string, value: string) => {
    const newSettings = {
      ...settings,
      registry: {
        type: settings.registry?.type || 'docker-hub',
        username: settings.registry?.username || '',
        ...settings.registry,
        [field]: value,
      },
    };
    saveSettings(newSettings);
  };

  const handleSystemChange = (field: string, value: string | number) => {
    const newSettings = {
      ...settings,
      system: {
        port: settings.system?.port || 3001,
        logLevel: settings.system?.logLevel || 'info',
        ...settings.system,
        [field]: value,
      },
    };
    saveSettings(newSettings);
  };

  const handleResourceChange = (field: string, value: number) => {
    const newSettings = {
      ...settings,
      resources: {
        maxConcurrentExecutions: settings.resources?.maxConcurrentExecutions || 10,
        monitoringRefreshInterval: settings.resources?.monitoringRefreshInterval || 30,
        ...settings.resources,
        [field]: value,
      },
    };
    saveSettings(newSettings);
  };

  const handleEditorChange = (editorId: string) => {
    const newSettings = {
      ...settings,
      editor: {
        defaultEditor: editorId,
        customCommand: settings.editor?.customCommand || '',
        autoDetect: settings.editor?.autoDetect ?? true,
        openInNewWindow: settings.editor?.openInNewWindow ?? false,
      },
    };
    saveSettings(newSettings);
  };

  const handleCustomCommandChange = (command: string) => {
    const newSettings = {
      ...settings,
      editor: {
        defaultEditor: settings.editor?.defaultEditor || 'vscode',
        customCommand: command,
        autoDetect: settings.editor?.autoDetect ?? true,
        openInNewWindow: settings.editor?.openInNewWindow ?? false,
      },
    };
    saveSettings(newSettings);
  };

  const handleEditorToggle = (field: string) => {
    const editorSettings = settings.editor;
    if (!editorSettings) return;
    
    const newSettings = {
      ...settings,
      editor: {
        ...editorSettings,
        [field]: !editorSettings[field as keyof typeof editorSettings],
      },
    };
    saveSettings(newSettings);
  };

  const handleTestEditor = async () => {
    setTestingEditor(true);
    try {
      const response = await fetch('/api/projects/open-in-editor');
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ ${result.message}\n\nDetected: ${result.detectedCommand || 'N/A'}`);
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error) {
      alert('❌ Failed to test editor configuration');
      console.error('Test editor error:', error);
    } finally {
      setTestingEditor(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 space-y-6">
        <div className="-mx-6 px-4 border-b flex h-12 items-center">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <h1 className="text-lg font-bold">Settings</h1>
          </div>
        </div>
        <div className="flex items-center justify-center min-h-[50vh]">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 space-y-6">
      <div className="-mx-6 px-4 border-b flex h-12 items-center">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <h1 className="text-lg font-bold">Settings</h1>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Analytics Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              <CardTitle>Analytics</CardTitle>
            </div>
            <CardDescription>
              Control analytics collection and dashboard features
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="analytics-enabled">Enable Analytics</Label>
                <p className="text-sm text-muted-foreground">
                  Collect and store usage analytics for the dashboard
                </p>
              </div>
              <Switch
                id="analytics-enabled"
                checked={settings.analytics.enabled}
                onCheckedChange={() => handleToggle("analytics", "enabled")}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        {/* Proxy Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Proxy Server</CardTitle>
            </div>
            <CardDescription>
              Configure proxy server and security settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="proxy-enabled">Enable Proxy</Label>
                <p className="text-sm text-muted-foreground">
                  Enable the proxy server functionality
                </p>
              </div>
              <Switch
                id="proxy-enabled"
                checked={settings.proxy.enabled}
                onCheckedChange={() => handleToggle("proxy", "enabled")}
                disabled={saving}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="redaction-enabled">Data Redaction</Label>
                <p className="text-sm text-muted-foreground">
                  Redact secrets, API keys, and sensitive data from coding agent output
                </p>
              </div>
              <Switch
                id="redaction-enabled"
                checked={settings.proxy.redactionEnabled}
                onCheckedChange={() =>
                  handleToggle("proxy", "redactionEnabled")
                }
                disabled={saving || !settings.proxy.enabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* Sandbox Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle>Sandbox</CardTitle>
            </div>
            <CardDescription>
              Configure sandbox isolation for secure execution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="sandbox-enabled">Enable Sandbox</Label>
                <p className="text-sm text-muted-foreground">
                  Enable sandbox isolation for secure command execution
                </p>
              </div>
              <Switch
                id="sandbox-enabled"
                checked={settings.sandbox.enabled}
                onCheckedChange={() => handleToggle("sandbox", "enabled")}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        {/* Connect IDE Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              <CardTitle>Connect IDE</CardTitle>
            </div>
            <CardDescription>
              Create global command aliases for easier access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="aliases-enabled">Enable IDE Integration</Label>
                  {settings.aliases.enabled && (
                    <Badge variant="secondary" className="text-xs">
                      Requires restart
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Create global &quot;claude&quot; and &quot;gemini&quot;
                  commands
                </p>
              </div>
              <Switch
                id="aliases-enabled"
                checked={settings.aliases.enabled}
                onCheckedChange={() => handleToggle("aliases", "enabled")}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        {/* Editor Integration Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              <CardTitle>Editor Integration</CardTitle>
            </div>
            <CardDescription>
              Configure your preferred code editor for opening projects
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="default-editor">Default Editor</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Search and select your preferred code editor
              </p>
              
              {/* Combobox for editor selection */}
              <Popover open={editorOpen} onOpenChange={setEditorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={editorOpen}
                    className="w-full justify-between"
                    disabled={saving}
                  >
                    <span className="flex items-center gap-2">
                      <span>{SUPPORTED_EDITORS.find(e => e.id === (settings.editor?.defaultEditor || 'vscode'))?.icon}</span>
                      <span>{SUPPORTED_EDITORS.find(e => e.id === (settings.editor?.defaultEditor || 'vscode'))?.name || "Select editor..."}</span>
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search editors..." />
                    <CommandEmpty>No editor found.</CommandEmpty>
                    <CommandGroup className="max-h-[300px] overflow-y-auto">
                      {SUPPORTED_EDITORS.map((editor) => (
                        <CommandItem
                          key={editor.id}
                          value={editor.id}
                          onSelect={(currentValue: string) => {
                            handleEditorChange(currentValue);
                            setEditorOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              (settings.editor?.defaultEditor || 'vscode') === editor.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="mr-2">{editor.icon}</span>
                          <span>{editor.name}</span>
                          {/* Platform indicators */}
                          {editor.platformRestricted?.includes('darwin') && editor.platformRestricted.length === 1 && (
                            <Badge variant="secondary" className="ml-auto text-xs">macOS</Badge>
                          )}
                          {editor.platformRestricted?.includes('win32') && editor.platformRestricted.length === 1 && (
                            <Badge variant="secondary" className="ml-auto text-xs">Windows</Badge>
                          )}
                          {editor.platformRestricted?.includes('linux') && editor.platformRestricted.length === 1 && (
                            <Badge variant="secondary" className="ml-auto text-xs">Linux</Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Show custom command input when "custom" is selected */}
            {settings.editor?.defaultEditor === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="custom-command">Custom Command</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Enter the full path or command to launch your editor
                </p>
                <Input
                  id="custom-command"
                  type="text"
                  placeholder="e.g., /usr/local/bin/myeditor"
                  value={settings.editor?.customCommand || ''}
                  onChange={(e) => handleCustomCommandChange(e.target.value)}
                  disabled={saving}
                />
              </div>
            )}

            {/* Additional options */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-detect">Auto-detect if unavailable</Label>
                  <p className="text-sm text-muted-foreground">
                    Try to find an installed editor if selection isn't found
                  </p>
                </div>
                <Switch
                  id="auto-detect"
                  checked={settings.editor?.autoDetect ?? true}
                  onCheckedChange={() => handleEditorToggle('autoDetect')}
                  disabled={saving}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="new-window">Open in new window</Label>
                  <p className="text-sm text-muted-foreground">
                    Open projects in a new editor window
                  </p>
                </div>
                <Switch
                  id="new-window"
                  checked={settings.editor?.openInNewWindow ?? false}
                  onCheckedChange={() => handleEditorToggle('openInNewWindow')}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Test button */}
            <Button 
              variant="outline" 
              onClick={handleTestEditor}
              className="w-full"
              disabled={!settings.editor?.defaultEditor || testingEditor || saving}
            >
              {testingEditor ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {testingEditor ? 'Testing...' : 'Test Editor Configuration'}
            </Button>

            {/* Help text */}
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">
                💡 Make sure your selected editor is installed and accessible from the command line. 
                Some editors may require additional setup to work with command-line launching.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Agents Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <CardTitle>Agents</CardTitle>
            </div>
            <CardDescription>
              Configure default agent and sandbox for task execution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="default-agent">Default Agent</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Select the default agent that will appear in the execution dropdown for tasks and subtasks
              </p>
              <Select
                value={settings.agents?.defaultAgent || 'claude'}
                onValueChange={handleAgentChange}
                disabled={saving}
              >
                <SelectTrigger id="default-agent" className="w-full">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <span>Claude</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="codex">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <span>Codex</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="gemini">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <span>Gemini</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="grok">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <span>Grok</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="opencode">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <span>OpenCode</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-sandbox">Default Agent Sandbox</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Select the default sandbox provider for agent execution
              </p>
              <Select
                value={settings.agents?.defaultSandbox || 'dagger'}
                onValueChange={handleSandboxChange}
                disabled={saving}
              >
                <SelectTrigger id="default-sandbox" className="w-full">
                  <SelectValue placeholder="Select a sandbox provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloudflare">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Cloudflare</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dagger">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Dagger</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="daytona">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Daytona</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="e2b">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>E2B</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="northflank">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Northflank</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Registry Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <CardTitle>Registry</CardTitle>
            </div>
            <CardDescription>
              Container registry configuration for pulling agent images
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="registry-type">Registry Type</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Select the container registry to use for agent images
              </p>
              <Select
                value={settings.registry?.type || 'docker-hub'}
                onValueChange={(value) => handleRegistryChange('type', value)}
                disabled={saving}
              >
                <SelectTrigger id="registry-type" className="w-full">
                  <SelectValue placeholder="Select registry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docker-hub">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      <span>Docker Hub</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ghcr">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      <span>GitHub Container Registry</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="gcr">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      <span>Google Container Registry</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ecr">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      <span>Amazon ECR</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="acr">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      <span>Azure Container Registry</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="registry-username">Registry Username</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Your username for the selected registry (optional)
              </p>
              <Input
                id="registry-username"
                type="text"
                placeholder="Enter your registry username"
                value={settings.registry?.username || ''}
                onChange={(e) => handleRegistryChange('username', e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                If not provided, will attempt to use public images
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              <CardTitle>System</CardTitle>
            </div>
            <CardDescription>
              Core system configuration and server settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="system-port">Dashboard Port</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Port number for the dashboard server (requires restart)
              </p>
              <Input
                id="system-port"
                type="number"
                min={1024}
                max={65535}
                value={settings.system?.port || 3001}
                onChange={(e) => handleSystemChange('port', parseInt(e.target.value) || 3001)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="log-level">Log Level</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Minimum log level for system logging
              </p>
              <Select
                value={settings.system?.logLevel || 'info'}
                onValueChange={(value) => handleSystemChange('logLevel', value)}
                disabled={saving}
              >
                <SelectTrigger id="log-level" className="w-full">
                  <SelectValue placeholder="Select log level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debug">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>Debug</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="info">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>Info</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="warn">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>Warning</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="error">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>Error</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Resource Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              <CardTitle>Resources</CardTitle>
            </div>
            <CardDescription>
              Resource limits and performance settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="max-executions">Max Concurrent Executions</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Maximum number of agent executions that can run simultaneously
              </p>
              <Input
                id="max-executions"
                type="number"
                min={1}
                max={50}
                value={settings.resources?.maxConcurrentExecutions || 10}
                onChange={(e) => handleResourceChange('maxConcurrentExecutions', parseInt(e.target.value) || 10)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refresh-interval">Monitoring Refresh Interval</Label>
              <p className="text-sm text-muted-foreground mb-3">
                How often to refresh monitoring data (seconds)
              </p>
              <Input
                id="refresh-interval"
                type="number"
                min={5}
                max={300}
                value={settings.resources?.monitoringRefreshInterval || 30}
                onChange={(e) => handleResourceChange('monitoringRefreshInterval', parseInt(e.target.value) || 30)}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {saving && (
        <div className="flex items-center justify-center p-4">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">
            Saving settings...
          </span>
        </div>
      )}
    </div>
  );
}
