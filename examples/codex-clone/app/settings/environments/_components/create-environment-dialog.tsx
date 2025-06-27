"use client";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Check, Star, GitFork, Computer, Monitor } from "lucide-react";
import { useEnvironmentStore, EnvironmentSharingStrategy } from "@/stores/environments";
import { useGitHubAuth } from "@/hooks/use-github-auth";
import { SmartRepositorySelector } from "./smart-repository-selector";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog as DialogPrimitive } from "@radix-ui/react-dialog";

interface CreateEnvironmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEnvironmentDialog({
  isOpen,
  onOpenChange,
}: CreateEnvironmentDialogProps) {
  const { isAuthenticated } = useGitHubAuth();
  const { createEnvironment } = useEnvironmentStore();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    selectedRepository: "",
    sharingStrategy: "manual" as EnvironmentSharingStrategy,
    useDesktop: false,
    desktopConfig: {
      resolution: "1920x1080",
      browser: "chrome" as "chrome" | "firefox",
      enableVSCode: true,
      enableDevTools: false,
      streamQuality: "medium" as "low" | "medium" | "high",
    },
  });
  const [isCreating, setIsCreating] = useState(false);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      selectedRepository: "",
      sharingStrategy: "manual",
      useDesktop: false,
      desktopConfig: {
        resolution: "1920x1080",
        browser: "chrome",
        enableVSCode: true,
        enableDevTools: false,
        streamQuality: "medium",
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.selectedRepository) {
      return;
    }

    setIsCreating(true);

    try {
      // Get GitHub access token from cookies
      const githubTokenCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("github_access_token="));

      const githubToken = githubTokenCookie?.split("=")[1] || "";

      // Parse organization and repository from full_name (owner/repo)
      const [githubOrganization] = formData.selectedRepository.split("/");

      // Create the environment
      createEnvironment({
        name: formData.name.trim(),
        description: formData.description.trim(),
        githubOrganization,
        githubToken,
        githubRepository: formData.selectedRepository,
        sharingStrategy: formData.sharingStrategy,
        sandboxConfig: {
          useDesktop: formData.useDesktop,
          template: formData.useDesktop ? "desktop" : undefined,
          desktopConfig: formData.useDesktop ? formData.desktopConfig : undefined,
        },
      });

      // Reset form and close dialog
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create environment:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const isFormValid = formData.name.trim() && formData.selectedRepository;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          resetForm();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new environment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Environment name *
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Enter environment name"
              className="w-full h-9 px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-[3px] focus:ring-ring/50 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              required
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Enter environment description"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-[3px] focus:ring-ring/50 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <label htmlFor="repository" className="text-sm font-medium">
              Select your Github repository *
            </label>
            
            <SmartRepositorySelector
              value={formData.selectedRepository}
              onChange={(value) => {
                const repoName = value.split('/').pop() || '';
                setFormData(prev => ({
                  ...prev,
                  selectedRepository: value,
                  name: prev.name || repoName // Auto-fill name if empty
                }));
              }}
            />
          </div>

          {/* Sandbox Type Selection */}
          <div className="flex flex-col gap-y-2">
            <label className="text-sm font-medium">Sandbox Type</label>
            <RadioGroup
              value={formData.useDesktop ? "desktop" : "code"}
              onValueChange={(value) => 
                setFormData(prev => ({ ...prev, useDesktop: value === "desktop" }))
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="code" id="code" />
                <Label htmlFor="code" className="flex items-center gap-2 cursor-pointer">
                  <Monitor className="h-4 w-4" />
                  Code Interpreter (Default)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="desktop" id="desktop" />
                <Label htmlFor="desktop" className="flex items-center gap-2 cursor-pointer">
                  <Computer className="h-4 w-4" />
                  Desktop Environment (Browser Control)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Desktop Configuration - only show when desktop is selected */}
          {formData.useDesktop && (
            <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
              <h4 className="text-sm font-medium">Desktop Configuration</h4>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Screen Resolution */}
                <div>
                  <Label htmlFor="resolution" className="text-sm">Resolution</Label>
                  <Select
                    value={formData.desktopConfig.resolution}
                    onValueChange={(value) => 
                      setFormData(prev => ({
                        ...prev,
                        desktopConfig: { ...prev.desktopConfig, resolution: value }
                      }))
                    }
                  >
                    <SelectTrigger id="resolution">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1920x1080">1920x1080 (Full HD)</SelectItem>
                      <SelectItem value="1366x768">1366x768 (HD)</SelectItem>
                      <SelectItem value="1280x720">1280x720 (HD Ready)</SelectItem>
                      <SelectItem value="2560x1440">2560x1440 (2K)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Browser Selection */}
                <div>
                  <Label htmlFor="browser" className="text-sm">Default Browser</Label>
                  <Select
                    value={formData.desktopConfig.browser}
                    onValueChange={(value: "chrome" | "firefox") => 
                      setFormData(prev => ({
                        ...prev,
                        desktopConfig: { ...prev.desktopConfig, browser: value }
                      }))
                    }
                  >
                    <SelectTrigger id="browser">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chrome">Google Chrome</SelectItem>
                      <SelectItem value="firefox">Mozilla Firefox</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Stream Quality */}
                <div>
                  <Label htmlFor="quality" className="text-sm">Stream Quality</Label>
                  <Select
                    value={formData.desktopConfig.streamQuality}
                    onValueChange={(value: "low" | "medium" | "high") => 
                      setFormData(prev => ({
                        ...prev,
                        desktopConfig: { ...prev.desktopConfig, streamQuality: value }
                      }))
                    }
                  >
                    <SelectTrigger id="quality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (Faster)</SelectItem>
                      <SelectItem value="medium">Medium (Balanced)</SelectItem>
                      <SelectItem value="high">High (Best Quality)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Feature Toggles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="vscode" className="text-sm cursor-pointer">
                    Enable VS Code Web
                  </Label>
                  <Switch
                    id="vscode"
                    checked={formData.desktopConfig.enableVSCode}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({
                        ...prev,
                        desktopConfig: { ...prev.desktopConfig, enableVSCode: checked }
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="devtools" className="text-sm cursor-pointer">
                    Enable Browser DevTools
                  </Label>
                  <Switch
                    id="devtools"
                    checked={formData.desktopConfig.enableDevTools}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({
                        ...prev,
                        desktopConfig: { ...prev.desktopConfig, enableDevTools: checked }
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Sharing Strategy */}
          <div className="flex flex-col gap-y-2">
            <label className="text-sm font-medium">Environment Sharing</label>
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
                <SelectItem value="manual">Manual (Manage yourself)</SelectItem>
                <SelectItem value="default">Default (Single persistent sandbox)</SelectItem>
                <SelectItem value="per-repo">Per Repository</SelectItem>
                <SelectItem value="throwaway">Throwaway (New for each task)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || isCreating}>
              {isCreating ? "Creating..." : "Create Environment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
