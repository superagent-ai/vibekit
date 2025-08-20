"use client";

import { Edit, Trash2, FolderOpen, GitBranch, Calendar, Tag, CheckCircle, MessageSquare, Kanban, Info, CheckSquare, Github } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Project } from "@/lib/projects";

interface ProjectCardProps {
  project: Project;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

interface GitInfo {
  hasGitRepo: boolean;
  account?: string;
  repo?: string;
  remoteUrl?: string;
}

export function ProjectCard({ project, isSelected = false, onSelect }: ProjectCardProps) {
  const router = useRouter();
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [isLoadingGit, setIsLoadingGit] = useState(false);
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    return status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  const getProjectFolderName = (fullPath: string) => {
    return fullPath.split('/').pop() || fullPath;
  };

  const parseGitUrl = (url: string): { account: string; repo: string } | null => {
    if (!url) return null;
    
    // Handle different Git URL formats
    // SSH: git@github.com:user/repo.git
    // HTTPS: https://github.com/user/repo.git
    // HTTPS without .git: https://github.com/user/repo
    
    let match;
    
    // SSH format
    match = url.match(/git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (match) {
      return { account: match[2], repo: match[3] };
    }
    
    // HTTPS format
    match = url.match(/https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (match) {
      return { account: match[2], repo: match[3] };
    }
    
    return null;
  };

  // Fetch Git info when component mounts
  useEffect(() => {
    const fetchGitInfo = async () => {
      if (!project.projectRoot) return;
      
      setIsLoadingGit(true);
      try {
        const response = await fetch('/api/projects/check-git', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectRoot: project.projectRoot }),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.hasGitRepo && data.gitInfo?.remoteUrl) {
            const parsed = parseGitUrl(data.gitInfo.remoteUrl);
            setGitInfo({
              hasGitRepo: true,
              account: parsed?.account,
              repo: parsed?.repo,
              remoteUrl: data.gitInfo.remoteUrl,
            });
          } else {
            setGitInfo({ hasGitRepo: false });
          }
        }
      } catch (error) {
        console.error('Failed to fetch git info:', error);
        setGitInfo({ hasGitRepo: false });
      } finally {
        setIsLoadingGit(false);
      }
    };

    fetchGitInfo();
  }, [project.projectRoot]);

  return (
    <Card 
      className={`group hover:shadow-md transition-all cursor-pointer ${
        isSelected ? 'ring-2 ring-primary shadow-md' : ''
      }`}
      onClick={() => router.push(`/projects/${project.id}`)}
    >
      <CardHeader className="space-y-3 pb-3">
        <CardTitle className="text-sm font-medium flex items-center">
          <FolderOpen className="mr-2 h-4 w-4" />
          {project.name}
          {isSelected && (
            <CheckCircle className="ml-2 h-4 w-4 text-primary" />
          )}
        </CardTitle>
        
        <div className="flex items-center justify-center gap-1">
          {!isSelected && onSelect && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(project.id);
                    }}
                    className="h-7 w-7 p-0"
                  >
                    <CheckSquare className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Set as Current</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/projects/${project.id}`);
                  }}
                  className="h-7 w-7 p-0"
                >
                  <Info className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View Details</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/projects/${project.id}/kanban`);
                  }}
                  className="h-7 w-7 p-0"
                >
                  <Kanban className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View Kanban</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/projects/${project.id}/chat`);
                  }}
                  className="h-7 w-7 p-0"
                >
                  <MessageSquare className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open chat for this project</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center text-xs text-muted-foreground">
            {gitInfo?.hasGitRepo && gitInfo.account && gitInfo.repo ? (
              <>
                <Github className="mr-2 h-3 w-3" />
                <span className="truncate">{gitInfo.account}/{gitInfo.repo}</span>
              </>
            ) : gitInfo?.hasGitRepo === false ? (
              <>
                <GitBranch className="mr-2 h-3 w-3" />
                <span className="truncate text-muted-foreground/60">No remote repository</span>
              </>
            ) : isLoadingGit ? (
              <>
                <GitBranch className="mr-2 h-3 w-3 animate-pulse" />
                <span className="truncate text-muted-foreground/60">Loading...</span>
              </>
            ) : (
              <>
                <GitBranch className="mr-2 h-3 w-3" />
                <span className="truncate">{getProjectFolderName(project.projectRoot)}</span>
              </>
            )}
          </div>
          
          {project.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {project.description}
            </p>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {project.priority && (
                <Badge 
                  variant={
                    project.priority === 'high' ? 'destructive' : 
                    project.priority === 'low' ? 'secondary' : 
                    'default'
                  }
                  className={`h-5 text-[10px] px-1.5 ${
                    project.priority === 'high' ? 'bg-red-100 text-red-800' : 
                    project.priority === 'low' ? '' : 
                    'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {project.priority === 'high' ? 'H' : 
                   project.priority === 'medium' ? 'M' : 'L'}
                </Badge>
              )}
              <Badge 
                variant="secondary" 
                className={`h-5 text-[10px] px-1.5 ${getStatusColor(project.status)}`}
              >
                {project.status === 'active' ? '✓' : 'AR'}
              </Badge>
            </div>
            
            <div className="flex items-center text-xs text-muted-foreground">
              <Calendar className="mr-1 h-3 w-3" />
              {formatDate(project.createdAt)}
            </div>
          </div>

          {project.tags && project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {project.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  <Tag className="mr-1 h-2 w-2" />
                  {tag}
                </Badge>
              ))}
              {project.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{project.tags.length - 3} more
                </Badge>
              )}
            </div>
          )}

          <div className="pt-2 space-y-1 text-xs text-muted-foreground">
            {project.setupScript && (
              <div className="flex items-center">
                <span className="font-medium w-12">Setup:</span>
                <span className="truncate">{project.setupScript}</span>
              </div>
            )}
            {project.devScript && (
              <div className="flex items-center">
                <span className="font-medium w-12">Dev:</span>
                <span className="truncate">{project.devScript}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}