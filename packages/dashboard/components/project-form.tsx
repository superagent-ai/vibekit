"use client";

import { useState, useEffect } from "react";
import { X, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DirectoryBrowser } from "@/components/directory-browser";
import type { Project } from "@/lib/projects";

interface ProjectFormProps {
  project?: Project;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

export function ProjectForm({ project, onSubmit, onCancel }: ProjectFormProps) {
  const [formData, setFormData] = useState({
    name: project?.name || '',
    projectRoot: project?.projectRoot || '',
    setupScript: project?.setupScript || '',
    devScript: project?.devScript || '',
    cleanupScript: project?.cleanupScript || '',
    description: project?.description || '',
    tags: project?.tags?.join(', ') || '',
    status: project?.status || 'active',
    priority: project?.priority || 'medium',
    taskSource: project?.taskSource || 'manual'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
  const [hasTaskmaster, setHasTaskmaster] = useState<boolean | null>(null);
  const [isCheckingTaskmaster, setIsCheckingTaskmaster] = useState(false);

  // Check for .taskmaster folder when project root changes
  useEffect(() => {
    const checkTaskmaster = async () => {
      if (!formData.projectRoot || formData.projectRoot.trim() === '') {
        setHasTaskmaster(null);
        return;
      }

      setIsCheckingTaskmaster(true);
      try {
        const response = await fetch('/api/projects/check-taskmaster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectRoot: formData.projectRoot })
        });
        
        if (response.ok) {
          const data = await response.json();
          setHasTaskmaster(data.hasTaskmaster);
          
          // Auto-set task source if this is a new project (not editing)
          if (!project && data.hasTaskmaster) {
            setFormData(prev => ({ ...prev, taskSource: 'taskmaster' }));
          }
        }
      } catch (error) {
        console.error('Failed to check for taskmaster:', error);
      } finally {
        setIsCheckingTaskmaster(false);
      }
    };

    // Debounce the check
    const timer = setTimeout(checkTaskmaster, 500);
    return () => clearTimeout(timer);
  }, [formData.projectRoot, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.projectRoot.trim()) {
      alert('Name and Project Root are required');
      return;
    }

    setIsSubmitting(true);
    
    const submitData = {
      ...formData,
      tags: formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
    };

    await onSubmit(submitData);
    setIsSubmitting(false);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDirectorySelect = (path: string) => {
    handleInputChange('projectRoot', path);
    setShowDirectoryBrowser(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{project ? 'Edit Project' : 'New Project'}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="My Awesome Project"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectRoot">Project Root *</Label>
              <div className="flex gap-2">
                <Input
                  id="projectRoot"
                  value={formData.projectRoot}
                  onChange={(e) => handleInputChange('projectRoot', e.target.value)}
                  placeholder="/path/to/your/project"
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowDirectoryBrowser(true)}
                  title="Browse for folder"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the absolute path to your project folder
              </p>
            </div>

            {/* Only show task management for new projects or if editing */}
            <div className="space-y-2">
              <Label htmlFor="taskSource">Task Management</Label>
              <div className="space-y-2">
                <select
                  id="taskSource"
                  value={formData.taskSource}
                  onChange={(e) => handleInputChange('taskSource', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="taskmaster">Taskmaster (.taskmaster folder)</option>
                  <option value="manual">Manual Tasks</option>
                </select>
                
                {/* Show detection status */}
                {formData.projectRoot && hasTaskmaster !== null && !isCheckingTaskmaster && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <span className="text-xs">
                      {hasTaskmaster ? (
                        <>✓ <code className="text-xs bg-background px-1 py-0.5 rounded">.taskmaster</code> folder detected</>
                      ) : (
                        <>ℹ️ No <code className="text-xs bg-background px-1 py-0.5 rounded">.taskmaster</code> folder found</>
                      )}
                    </span>
                  </div>
                )}
                
                {isCheckingTaskmaster && (
                  <div className="text-xs text-muted-foreground">
                    Checking for .taskmaster folder...
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground">
                  {formData.taskSource === 'manual' 
                    ? 'Tasks will be created and managed within VibeKit'
                    : 'Tasks will be read from the Taskmaster configuration file'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of your project"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => handleInputChange('tags', e.target.value)}
                placeholder="react, typescript, node (comma separated)"
              />
              <p className="text-xs text-muted-foreground">
                Separate tags with commas
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setupScript">Setup Script</Label>
              <Input
                id="setupScript"
                value={formData.setupScript}
                onChange={(e) => handleInputChange('setupScript', e.target.value)}
                placeholder="npm install"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="devScript">Development Script</Label>
              <Input
                id="devScript"
                value={formData.devScript}
                onChange={(e) => handleInputChange('devScript', e.target.value)}
                placeholder="npm run dev"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cleanupScript">Cleanup Script</Label>
              <Input
                id="cleanupScript"
                value={formData.cleanupScript}
                onChange={(e) => handleInputChange('cleanupScript', e.target.value)}
                placeholder="rm -rf node_modules"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : (project ? 'Update' : 'Create')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      
      {showDirectoryBrowser && (
        <DirectoryBrowser
          onSelect={handleDirectorySelect}
          onCancel={() => setShowDirectoryBrowser(false)}
          initialPath={formData.projectRoot}
        />
      )}
    </div>
  );
}