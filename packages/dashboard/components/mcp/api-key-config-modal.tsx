"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, Key, Info, CheckCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface MCPServer {
  name: string;
  description: string;
  repository: string;
  url?: string;
  xHandle?: string;
  category: string;
  requiresApiKeys?: boolean;
  requiredForTaskmaster?: boolean;
  envVars?: {
    essential?: string[];
    optional?: string[];
    anyOne?: string[];
  } | string[];
  envVarDescriptions?: Record<string, string>;
  config: {
    command: string;
    args: string[];
    enabled: boolean;
  };
}

interface ApiKeyConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: MCPServer;
  onInstall: (apiKeys: Record<string, string> | null) => Promise<void>;
}

export function ApiKeyConfigModal({
  open,
  onOpenChange,
  server,
  onInstall
}: ApiKeyConfigModalProps) {
  // Normalize envVars to handle different formats
  const normalizedEnvVars = Array.isArray(server.envVars) 
    ? { essential: server.envVars, optional: [], anyOne: [] }
    : {
        essential: server.envVars?.essential || [],
        optional: server.envVars?.optional || [],
        anyOne: server.envVars?.anyOne || []
      };

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isInstalling, setIsInstalling] = useState(false);
  const [existingEnvVars, setExistingEnvVars] = useState<Record<string, boolean>>({});
  const [useExistingEnv, setUseExistingEnv] = useState(false);
  const [activeTab, setActiveTab] = useState(
    normalizedEnvVars.essential.length > 0 ? "essential" :
    normalizedEnvVars.anyOne.length > 0 ? "anyOne" : "optional"
  );

  // Check for existing environment variables when modal opens
  useEffect(() => {
    if (open && server.requiresApiKeys) {
      checkExistingEnvVars();
    }
  }, [open, server.requiresApiKeys]);

  const checkExistingEnvVars = async () => {
    try {
      // Get all possible env vars for this server
      const allEnvVars = [
        ...normalizedEnvVars.essential,
        ...normalizedEnvVars.optional,
        ...normalizedEnvVars.anyOne
      ];

      // Check which ones exist in the environment
      const response = await fetch('/api/config/env-vars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keys: allEnvVars })
      });

      if (response.ok) {
        const data = await response.json();
        setExistingEnvVars(data.existing || {});
        
        // If we have existing env vars that satisfy requirements, suggest using them
        const hasRequiredEnvVars = normalizedEnvVars.essential.every(key => data.existing[key]) &&
          (normalizedEnvVars.anyOne.length === 0 || normalizedEnvVars.anyOne.some(key => data.existing[key]));
        
        if (hasRequiredEnvVars) {
          setUseExistingEnv(true);
        }
      }
    } catch (error) {
      console.error('Failed to check existing environment variables:', error);
    }
  };

  const handleApiKeyChange = (key: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [key]: value }));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      // If using existing env vars, pass null to indicate the server should use process.env
      // Otherwise pass the manually entered API keys
      const keysToPass = useExistingEnv ? null : apiKeys;
      await onInstall(keysToPass);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to install server:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const canInstallWithEssential = useExistingEnv 
    ? normalizedEnvVars.essential.every(key => existingEnvVars[key])
    : normalizedEnvVars.essential.every(key => apiKeys[key]?.trim());
    
  const canInstallWithAnyOne = normalizedEnvVars.anyOne.length === 0 || (useExistingEnv 
    ? normalizedEnvVars.anyOne.some(key => existingEnvVars[key])
    : normalizedEnvVars.anyOne.some(key => apiKeys[key]?.trim()));
    
  const hasOptionalKeys = normalizedEnvVars.optional.length > 0;
  const hasAnyOneKeys = normalizedEnvVars.anyOne.length > 0;
  
  const canInstall = canInstallWithEssential && canInstallWithAnyOne;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Configure API Keys - {server.name}
          </DialogTitle>
          <DialogDescription>
            {server.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {server.requiredForTaskmaster && (
            <Alert className="mb-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Required for Taskmaster:</strong> This server is essential for task expansion 
                and subtask management in taskmaster projects. At minimum, you need the essential API keys.
              </AlertDescription>
            </Alert>
          )}

          {/* Environment Variable Detection */}
          {Object.keys(existingEnvVars).length > 0 && (
            <Alert className="mb-4">
              <Settings className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div>
                    <strong>Environment Variables Detected:</strong> Found{" "}
                    {Object.values(existingEnvVars).filter(Boolean).length} API key(s) in your environment.
                    <div className="text-xs mt-1 space-y-1">
                      {Object.entries(existingEnvVars)
                        .filter(([_, exists]) => exists)
                        .map(([key]) => (
                          <div key={key} className="flex items-center gap-2">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                            <code className="text-xs bg-muted px-1 rounded">{key}</code>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="use-existing" className="text-xs">Use existing</Label>
                    <Switch
                      id="use-existing"
                      checked={useExistingEnv}
                      onCheckedChange={setUseExistingEnv}
                    />
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={cn("grid w-full", 
              normalizedEnvVars.essential.length > 0 && hasAnyOneKeys && hasOptionalKeys ? "grid-cols-3" :
              (normalizedEnvVars.essential.length > 0 || hasAnyOneKeys) && hasOptionalKeys ? "grid-cols-2" :
              "grid-cols-1"
            )}>
              {normalizedEnvVars.essential.length > 0 && (
                <TabsTrigger value="essential" className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs px-1">Required</Badge>
                  Essential ({normalizedEnvVars.essential.length})
                </TabsTrigger>
              )}
              {hasAnyOneKeys && (
                <TabsTrigger value="anyOne" className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs px-1">Any One</Badge>
                  Choose One ({normalizedEnvVars.anyOne.length})
                </TabsTrigger>
              )}
              {hasOptionalKeys && (
                <TabsTrigger value="optional" className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs px-1">Optional</Badge>
                  Optional ({normalizedEnvVars.optional.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="essential" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4" />
                  These API keys are required for basic functionality
                </div>
                {normalizedEnvVars.essential.map((key) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key} className="text-sm font-medium">
                      {key}
                      <Badge variant="destructive" className="ml-2 text-xs">Required</Badge>
                    </Label>
                    {server.envVarDescriptions?.[key] && (
                      <p className="text-xs text-muted-foreground">
                        {server.envVarDescriptions[key]}
                      </p>
                    )}
                    <div className="relative">
                      <Input
                        id={key}
                        type={showPasswords[key] ? "text" : "password"}
                        value={apiKeys[key] || ""}
                        onChange={(e) => handleApiKeyChange(key, e.target.value)}
                        placeholder={`Enter your ${key}`}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility(key)}
                      >
                        {showPasswords[key] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="anyOne" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Key className="h-4 w-4" />
                  You need at least ONE API key from the options below
                </div>
                {normalizedEnvVars.anyOne.map((key) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key} className="text-sm font-medium">
                      {key}
                      <Badge variant="default" className="ml-2 text-xs">Choose One</Badge>
                    </Label>
                    {server.envVarDescriptions?.[key] && (
                      <p className="text-xs text-muted-foreground">
                        {server.envVarDescriptions[key]}
                      </p>
                    )}
                    <div className="relative">
                      <Input
                        id={key}
                        type={showPasswords[key] ? "text" : "password"}
                        value={apiKeys[key] || ""}
                        onChange={(e) => handleApiKeyChange(key, e.target.value)}
                        placeholder={`Enter your ${key}`}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility(key)}
                      >
                        {showPasswords[key] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="optional" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4" />
                  These API keys provide additional features but aren't required
                </div>
                {normalizedEnvVars.optional.map((key) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key} className="text-sm font-medium">
                      {key}
                      <Badge variant="secondary" className="ml-2 text-xs">Optional</Badge>
                    </Label>
                    {server.envVarDescriptions?.[key] && (
                      <p className="text-xs text-muted-foreground">
                        {server.envVarDescriptions[key]}
                      </p>
                    )}
                    <div className="relative">
                      <Input
                        id={key}
                        type={showPasswords[key] ? "text" : "password"}
                        value={apiKeys[key] || ""}
                        onChange={(e) => handleApiKeyChange(key, e.target.value)}
                        placeholder={`Enter your ${key} (optional)`}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility(key)}
                      >
                        {showPasswords[key] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {canInstall 
                ? useExistingEnv
                  ? `✅ Ready to install using existing environment variables`
                  : `✅ Ready to install with ${Object.keys(apiKeys).filter(k => apiKeys[k]?.trim()).length} API key(s)`
                : hasAnyOneKeys && !canInstallWithAnyOne
                ? `⚠️ Need at least ONE API key from the available options`
                : !canInstallWithEssential
                ? `⚠️ Need at least ${normalizedEnvVars.essential.length} essential API key(s)`
                : `⚠️ Missing required API keys`
              }
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleInstall}
                disabled={!canInstall || isInstalling}
              >
                {isInstalling ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border border-current border-t-transparent" />
                    Installing...
                  </div>
                ) : (
                  "Install Server"
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}