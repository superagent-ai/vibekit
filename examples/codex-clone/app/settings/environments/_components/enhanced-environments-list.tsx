"use client";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Trash2, 
  ExternalLink, 
  MoreHorizontal, 
  Star, 
  Clock, 
  Zap, 
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Crown,
  Timer,
  Settings,
  Edit
} from "lucide-react";
import { useEnvironmentStore, type Environment, type EnvironmentSharingStrategy } from "@/stores/environments";
import { useGitHubAuth } from "@/hooks/use-github-auth";
import { EnhancedCreateEnvironmentDialog } from "./enhanced-create-environment-dialog";

export function EnhancedEnvironmentsList() {
  const { isAuthenticated } = useGitHubAuth();
  const {
    environments,
    deleteEnvironment,
    setDefaultEnvironment,
    extendEnvironment,
    getExpiredEnvironments,
    cleanupExpiredEnvironments,
  } = useEnvironmentStore();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [extending, setExtending] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState<Environment | null>(null);

  // Check for expired environments
  const expiredEnvironments = getExpiredEnvironments();

  useEffect(() => {
    // Auto-cleanup expired environments on component mount
    if (expiredEnvironments.length > 0) {
      console.log(`Found ${expiredEnvironments.length} expired environments`);
    }
  }, [expiredEnvironments.length]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this environment? This action cannot be undone.")) {
      return;
    }

    setDeletingId(id);
    try {
      deleteEnvironment(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = (id: string) => {
    setDefaultEnvironment(id);
  };

  const handleExtend = async (id: string) => {
    setExtending(id);
    try {
      const success = extendEnvironment(id);
      if (!success) {
        alert("Cannot extend environment: maximum extensions reached");
      }
    } finally {
      setExtending(null);
    }
  };

  const handleCleanupExpired = () => {
    if (confirm(`Clean up ${expiredEnvironments.length} expired environments?`)) {
      cleanupExpiredEnvironments();
    }
  };

  const handleEdit = (environment: Environment) => {
    setEditingEnvironment(environment);
  };

  const handleCloseEditDialog = () => {
    setEditingEnvironment(null);
  };

  const getStatusInfo = (env: Environment) => {
    const now = new Date();
    const isExpired = env.expiresAt && env.expiresAt < now;
    const isExpiringSoon = env.expiresAt && env.expiresAt < new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (isExpired) {
      return { status: "expired", color: "destructive", icon: AlertTriangle };
    }
    if (isExpiringSoon) {
      return { status: "expiring", color: "warning", icon: Timer };
    }
    if (env.isActive) {
      return { status: "ready", color: "success", icon: CheckCircle };
    }
    return { status: "disabled", color: "secondary", icon: Clock };
  };

  const getSharingStrategyInfo = (strategy: EnvironmentSharingStrategy) => {
    switch (strategy) {
      case "default":
        return { label: "Default", color: "default", icon: Crown };
      case "per-repo":
        return { label: "Per Repository", color: "blue", icon: Settings };
      case "throwaway":
        return { label: "Throwaway", color: "orange", icon: Zap };
      case "manual":
      default:
        return { label: "Manual", color: "gray", icon: Settings };
    }
  };

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Authentication Required</CardTitle>
          <CardDescription>
            Please sign in with GitHub to manage environments.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (environments.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>No Environments</CardTitle>
                <CardDescription>
                  Create your first environment to get started with development sandboxes.
                </CardDescription>
              </div>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Create Environment
              </Button>
            </div>
          </CardHeader>
        </Card>
        
        <EnhancedCreateEnvironmentDialog 
          isOpen={isCreateDialogOpen} 
          onOpenChange={setIsCreateDialogOpen}
          editingEnvironment={editingEnvironment}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Expired environments alert */}
      {expiredEnvironments.length > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {expiredEnvironments.length} environment{expiredEnvironments.length > 1 ? 's' : ''} have expired
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCleanupExpired}
              className="ml-4"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clean Up
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Development Environments</CardTitle>
              <CardDescription>
                Manage your cloud development environments. Environments define configurations for sandboxes that are created on-demand when running tasks.
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Create Environment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
              <TableRow>
                <TableHead>Environment</TableHead>
                <TableHead>Repository</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Environment Status</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {environments.map((env) => {
                const statusInfo = getStatusInfo(env);
                const strategyInfo = getSharingStrategyInfo(env.sharingStrategy);
                const StatusIcon = statusInfo.icon;
                const StrategyIcon = strategyInfo.icon;

                return (
                  <TableRow key={env.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{env.name}</span>
                          {env.isDefault && (
                            <Badge variant="default" className="text-xs">
                              <Crown className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                        {env.description && (
                          <p className="text-sm text-muted-foreground">
                            {env.description}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <a
                        href={`https://github.com/${env.githubRepository}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                      >
                        {env.githubRepository}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        <StrategyIcon className="h-3 w-3" />
                        {strategyInfo.label}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge 
                        variant={statusInfo.color as any}
                        className="flex items-center gap-1 w-fit"
                      >
                        <StatusIcon className="h-3 w-3" />
                        {statusInfo.status}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {env.expiresAt ? (
                        <div className="space-y-1">
                          <div className="text-sm">
                            {formatDistanceToNow(env.expiresAt, { addSuffix: true })}
                          </div>
                          {env.autoExtend && (
                            <div className="text-xs text-muted-foreground">
                              Auto-extend: {env.extensionHours}h
                              {env.maxExtensions && (
                                <span> ({env.extensionCount || 0}/{env.maxExtensions})</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Never expires</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="text-sm">
                        <div>Created: {formatDistanceToNow(env.createdAt, { addSuffix: true })}</div>
                        {env.lastUsedAt && (
                          <div className="text-muted-foreground">
                            Used: {formatDistanceToNow(env.lastUsedAt, { addSuffix: true })}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(env)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Environment
                          </DropdownMenuItem>
                          
                          {!env.isDefault && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleSetDefault(env.id)}>
                                <Star className="h-4 w-4 mr-2" />
                                Set as Default
                              </DropdownMenuItem>
                            </>
                          )}
                          
                          {env.expiresAt && (
                            <>
                              <DropdownMenuItem 
                                onClick={() => handleExtend(env.id)}
                                disabled={extending === env.id}
                              >
                                <RefreshCw className={`h-4 w-4 mr-2 ${extending === env.id ? 'animate-spin' : ''}`} />
                                Extend ({env.extensionHours || 1}h)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          
                          <DropdownMenuItem
                            onClick={() => handleDelete(env.id)}
                            disabled={deletingId === env.id}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {deletingId === env.id ? "Deleting..." : "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
      
      <EnhancedCreateEnvironmentDialog
        isOpen={isCreateDialogOpen || !!editingEnvironment}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingEnvironment(null);
          }
        }}
        editingEnvironment={editingEnvironment}
      />
    </div>
  );
}