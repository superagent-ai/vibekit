"use client";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Check, Star, GitFork, Clock, Settings, Zap, InfoIcon, RefreshCw, Server } from "lucide-react";
import { useEnvironmentStore, type EnvironmentSharingStrategy, type Environment } from "@/stores/environments";
import { useGitHubAuth } from "@/hooks/use-github-auth";
import { SmartRepositorySelector } from "./smart-repository-selector";

interface EnhancedCreateEnvironmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editingEnvironment?: Environment | null;
}

export function EnhancedCreateEnvironmentDialog({
  isOpen,
  onOpenChange,
  editingEnvironment,
}: EnhancedCreateEnvironmentDialogProps) {
  const { isAuthenticated } = useGitHubAuth();
  const { createEnvironment, updateEnvironment, getDefaultEnvironment } = useEnvironmentStore();

    // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    selectedRepository: "",
    sharingStrategy: "manual" as EnvironmentSharingStrategy,
    isDefault: false,
    expiresAt: "",
    autoExtend: false,
    extensionHours: 1,
    maxExtensions: undefined as number | undefined,
    sandboxType: "new" as "new" | "existing", // New field for sandbox selection type
    sandboxTemplate: "",
    existingSandboxId: "", // New field for existing sandbox selection
    sandboxTimeoutMs: 3600000, // 1 hour in ms
    sandboxEnvironment: {} as Record<string, string>,
  });
  
  const [isCreating, setIsCreating] = useState(false);
  const [regenerateSandbox, setRegenerateSandbox] = useState(false);
  const [envVarPairs, setEnvVarPairs] = useState<Array<{key: string, value: string}>>([{key: "", value: ""}]);
  
  // Existing sandboxes state
  const [existingSandboxes, setExistingSandboxes] = useState<Array<{
    id: string;
    status: string;
    template: string;
    createdAt: string;
    displayName: string;
    url: string;
  }>>([]);
  const [loadingSandboxes, setLoadingSandboxes] = useState(false);

  const existingDefault = getDefaultEnvironment();

  // Function to load existing sandboxes
  const loadExistingSandboxes = async () => {
    setLoadingSandboxes(true);
    try {
      const { listE2BSandboxesAction } = await import("@/app/actions/inngest");
      const sandboxes = await listE2BSandboxesAction();
      setExistingSandboxes(sandboxes);
    } catch (error) {
      console.error("Failed to load existing sandboxes:", error);
      setExistingSandboxes([]);
    } finally {
      setLoadingSandboxes(false);
    }
  };

  // Reset form when dialog opens or populate with editing environment
  useEffect(() => {
    if (isOpen) {
      if (editingEnvironment) {
        // Populate form with existing environment data
        const envVars = editingEnvironment.sandboxConfig?.environment || {};
        const envVarPairs = Object.entries(envVars).map(([key, value]) => ({ key, value }));
        if (envVarPairs.length === 0) envVarPairs.push({ key: "", value: "" });
        
        setFormData({
          name: editingEnvironment.name,
          description: editingEnvironment.description || "",
          selectedRepository: editingEnvironment.githubRepository,
          sharingStrategy: editingEnvironment.sharingStrategy,
          isDefault: editingEnvironment.isDefault || false,
          expiresAt: editingEnvironment.expiresAt ? 
            new Date(editingEnvironment.expiresAt.getTime() - (editingEnvironment.expiresAt.getTimezoneOffset() * 60000))
              .toISOString().slice(0, 16) : "",
          autoExtend: editingEnvironment.autoExtend || false,
          extensionHours: editingEnvironment.extensionHours || 1,
          maxExtensions: editingEnvironment.maxExtensions,
          sandboxType: editingEnvironment.sandboxConfig?.existingSandboxId ? "existing" : "new",
          sandboxTemplate: editingEnvironment.sandboxConfig?.template || "",
          existingSandboxId: editingEnvironment.sandboxConfig?.existingSandboxId || "",
          sandboxTimeoutMs: editingEnvironment.sandboxConfig?.timeoutMs || 3600000,
          sandboxEnvironment: envVars,
        });
        setEnvVarPairs(envVarPairs);
      } else {
        // Reset form for new environment
        setFormData({
          name: "",
          description: "",
          selectedRepository: "",
          sharingStrategy: "manual",
          isDefault: false,
          expiresAt: "",
          autoExtend: false,
          extensionHours: 1,
          maxExtensions: undefined,
          sandboxType: "new",
          sandboxTemplate: "",
          existingSandboxId: "",
          sandboxTimeoutMs: 3600000,
          sandboxEnvironment: {},
        });
        setEnvVarPairs([{key: "", value: ""}]);
      }
      
      // Reset regenerate option
      setRegenerateSandbox(false);
      
      // Load existing sandboxes for selection
      loadExistingSandboxes();
    }
  }, [isOpen, editingEnvironment]);


  const handleRepositorySelect = (repoFullName: string) => {
    // Extract repo name from full name
    const repoName = repoFullName.split('/').pop() || '';
    
    setFormData(prev => ({
      ...prev,
      selectedRepository: repoFullName,
      name: prev.name || repoName, // Auto-fill name if empty
    }));
  };

  const handleEnvVarChange = (index: number, field: 'key' | 'value', value: string) => {
    const newPairs = [...envVarPairs];
    newPairs[index][field] = value;
    
    // Add new empty pair if this is the last one and both fields are filled
    if (index === envVarPairs.length - 1 && newPairs[index].key && newPairs[index].value) {
      newPairs.push({key: "", value: ""});
    }
    
    setEnvVarPairs(newPairs);
  };

  const removeEnvVar = (index: number) => {
    if (envVarPairs.length > 1) {
      setEnvVarPairs(envVarPairs.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    if (!formData.selectedRepository || !formData.name.trim()) return;

    // Build environment variables object
    const envVars = envVarPairs
      .filter(pair => pair.key && pair.value)
      .reduce((acc, pair) => {
        acc[pair.key] = pair.value;
        return acc;
      }, {} as Record<string, string>);

    setIsCreating(true);
    try {
      // Extract owner and repo from full name
      const [owner, repoName] = formData.selectedRepository.split('/');
      if (!owner || !repoName) throw new Error("Invalid repository format");

      // Parse expiry date
      const expiresAt = formData.expiresAt 
        ? new Date(formData.expiresAt)
        : undefined;

      const environmentData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        githubOrganization: owner,
        githubToken: document.cookie
          .split('; ')
          .find(row => row.startsWith('github_access_token='))
          ?.split('=')[1] || '',
        githubRepository: formData.selectedRepository,
        sharingStrategy: formData.sharingStrategy,
        isDefault: formData.isDefault,
        expiresAt,
        autoExtend: formData.autoExtend,
        extensionHours: formData.extensionHours,
        maxExtensions: formData.maxExtensions,
        sandboxConfig: (formData.sandboxType === 'existing' && formData.existingSandboxId) || 
                       (formData.sandboxTemplate && formData.sandboxTemplate !== 'default') || 
                       formData.sandboxTimeoutMs !== 3600000 || 
                       Object.keys(envVars).length > 0 || 
                       regenerateSandbox ? {
          template: formData.sandboxType === 'new' && formData.sandboxTemplate !== 'default' ? formData.sandboxTemplate : undefined,
          existingSandboxId: formData.sandboxType === 'existing' && !regenerateSandbox ? formData.existingSandboxId : undefined,
          timeoutMs: formData.sandboxTimeoutMs,
          environment: Object.keys(envVars).length > 0 ? envVars : undefined,
          forceRegenerate: regenerateSandbox, // Add flag to force new sandbox creation
        } : undefined,
      };

      if (editingEnvironment) {
        // Update existing environment
        updateEnvironment(editingEnvironment.id, environmentData);
      } else {
        // Create new environment
        createEnvironment(environmentData);
      }

      onOpenChange(false);
    } catch (error) {
      const action = editingEnvironment ? "update" : "create";
      console.error(`Failed to ${action} environment:`, error);
      alert(`Failed to ${action} environment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
          </DialogHeader>
          <p>Please sign in with GitHub to create environments.</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {editingEnvironment ? `Edit Environment: ${editingEnvironment.name}` : "Create New Environment"}
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="basic" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="sharing">Sharing & Expiry</TabsTrigger>
            <TabsTrigger value="sandbox">Sandbox Config</TabsTrigger>
          </TabsList>
          
          <div className="mt-4 overflow-y-auto max-h-[60vh]">
            <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="env-name">Environment Name *</Label>
                <Input
                  id="env-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My Development Environment"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="env-description">Description</Label>
                <Textarea
                  id="env-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description of this environment"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Repository *</Label>
                <SmartRepositorySelector
                  value={formData.selectedRepository}
                  onChange={(value) => handleRepositorySelect(value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="sharing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Sharing Strategy
                  </CardTitle>
                  <CardDescription>
                    How should this environment be used across tasks and repositories?
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select
                    value={formData.sharingStrategy}
                    onValueChange={(value: EnvironmentSharingStrategy) => 
                      setFormData(prev => ({ ...prev, sharingStrategy: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual - I'll select this environment manually</SelectItem>
                      <SelectItem value="default">Default - Use for all tasks (single persistent environment)</SelectItem>
                      <SelectItem value="per-repo">Per Repository - One environment per repository</SelectItem>
                      <SelectItem value="throwaway">Throwaway - New environment for each task</SelectItem>
                    </SelectContent>
                  </Select>

                  {formData.sharingStrategy === "default" && (
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertDescription>
                        {existingDefault ? 
                          "This will replace the current default environment." :
                          "This environment will be automatically used for all new tasks."
                        }
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is-default"
                      checked={formData.isDefault || formData.sharingStrategy === "default"}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isDefault: checked }))}
                      disabled={formData.sharingStrategy === "default"}
                    />
                    <Label htmlFor="is-default">Set as default environment</Label>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Expiry & Extensions
                  </CardTitle>
                  <CardDescription>
                    Configure when this environment expires and how it can be extended.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="expires-at">Expires At</Label>
                    <Input
                      id="expires-at"
                      type="datetime-local"
                      value={formData.expiresAt}
                      onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty for no expiration. Environment will be automatically cleaned up after expiry.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto-extend"
                      checked={formData.autoExtend}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, autoExtend: checked }))}
                    />
                    <Label htmlFor="auto-extend">Auto-extend on use</Label>
                  </div>

                  {formData.autoExtend && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="extension-hours">Extension Duration (hours)</Label>
                        <Input
                          id="extension-hours"
                          type="number"
                          min="1"
                          max="24"
                          value={formData.extensionHours}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            extensionHours: parseInt(e.target.value) || 1 
                          }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="max-extensions">Max Extensions (optional)</Label>
                        <Input
                          id="max-extensions"
                          type="number"
                          min="1"
                          value={formData.maxExtensions || ""}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            maxExtensions: e.target.value ? parseInt(e.target.value) : undefined
                          }))}
                          placeholder="Unlimited"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sandbox" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Sandbox Configuration
                  </CardTitle>
                  <CardDescription>
                    {editingEnvironment ? 
                      "Update sandbox configuration. You can regenerate the sandbox if needed." :
                      "Choose to create a new E2B sandbox or reuse an existing one."
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Regenerate Sandbox Option (Edit Mode Only) */}
                  {editingEnvironment && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="regenerate-sandbox"
                          checked={regenerateSandbox}
                          onCheckedChange={setRegenerateSandbox}
                        />
                        <Label htmlFor="regenerate-sandbox" className="font-medium">
                          Regenerate Sandbox
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Force creation of a new sandbox instance. This will discard any files or processes in the current sandbox.
                      </p>
                      {regenerateSandbox && (
                        <Alert>
                          <RefreshCw className="h-4 w-4" />
                          <AlertDescription>
                            ⚠️ Regenerating will create a completely new sandbox and discard the current one. 
                            Any unsaved work will be lost.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {/* Sandbox Type Selection */}
                  <div className="space-y-3">
                    <Label>Sandbox Type</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div 
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          formData.sandboxType === 'new' 
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setFormData(prev => ({ ...prev, sandboxType: 'new' }))}
                      >
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          <span className="font-medium">New Sandbox</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Create a fresh E2B sandbox with selected template
                        </p>
                      </div>
                      
                      <div 
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          formData.sandboxType === 'existing' 
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setFormData(prev => ({ ...prev, sandboxType: 'existing' }))}
                      >
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          <span className="font-medium">Existing Sandbox</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Reuse a running E2B sandbox instance
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* New Sandbox Configuration */}
                  {formData.sandboxType === 'new' && (
                    <div className="space-y-2">
                      <Label htmlFor="sandbox-template">E2B Template</Label>
                      <Select
                        value={formData.sandboxTemplate}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, sandboxTemplate: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Default template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="vibekit-codex">VibeKit Codex</SelectItem>
                          <SelectItem value="vibekit-claude">VibeKit Claude</SelectItem>
                          <SelectItem value="base">Base Template</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Existing Sandbox Selection */}
                  {formData.sandboxType === 'existing' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="existing-sandbox">Running Sandboxes</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={loadExistingSandboxes}
                          disabled={loadingSandboxes}
                          className="h-7 px-2"
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${loadingSandboxes ? 'animate-spin' : ''}`} />
                          Refresh
                        </Button>
                      </div>
                      
                      {loadingSandboxes ? (
                        <div className="p-3 text-center text-sm text-muted-foreground border rounded">
                          Loading available sandboxes...
                        </div>
                      ) : existingSandboxes.length === 0 ? (
                        <div className="p-3 text-center text-sm text-muted-foreground border rounded">
                          No running sandboxes found. Create a new sandbox instead.
                        </div>
                      ) : (
                        <Select
                          value={formData.existingSandboxId}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, existingSandboxId: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a running sandbox" />
                          </SelectTrigger>
                          <SelectContent>
                            {existingSandboxes.map((sandbox) => (
                              <SelectItem key={sandbox.id} value={sandbox.id}>
                                <div className="flex flex-col">
                                  <span>{sandbox.displayName}</span>
                                  <span className="text-xs text-muted-foreground">
                                    Status: {sandbox.status} • Template: {sandbox.template}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      
                      {formData.existingSandboxId && (
                        <Alert>
                          <InfoIcon className="h-4 w-4" />
                          <AlertDescription>
                            Using existing sandbox will preserve all files and running processes. 
                            The sandbox timeout cannot be modified for existing instances.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {formData.sandboxType === 'new' && (
                    <div className="space-y-2">
                      <Label htmlFor="sandbox-timeout">Sandbox Timeout (minutes)</Label>
                      <Select
                        value={String(formData.sandboxTimeoutMs / 60000)}
                        onValueChange={(value) => setFormData(prev => ({ 
                          ...prev, 
                          sandboxTimeoutMs: parseInt(value) * 60000 
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 minutes</SelectItem>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="60">1 hour (maximum)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Environment Variables</Label>
                    <div className="space-y-2">
                      {envVarPairs.map((pair, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            placeholder="Key"
                            value={pair.key}
                            onChange={(e) => handleEnvVarChange(index, 'key', e.target.value)}
                          />
                          <Input
                            placeholder="Value"
                            value={pair.value}
                            onChange={(e) => handleEnvVarChange(index, 'value', e.target.value)}
                          />
                          {envVarPairs.length > 1 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeEnvVar(index)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !formData.selectedRepository || 
              !formData.name.trim() || 
              (formData.sandboxType === 'existing' && !formData.existingSandboxId) ||
              isCreating
            }
          >
            {isCreating ? 
              (editingEnvironment ? "Updating..." : "Creating...") : 
              (editingEnvironment ? "Update Environment" : "Create Environment")
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}