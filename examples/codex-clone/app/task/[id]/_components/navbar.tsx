"use client";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  Dot,
  GitBranchPlus,
  GithubIcon,
  Loader2,
  Copy,
  ChevronDown,
  MoreHorizontal,
  Edit,
  GitBranch,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useTaskStore } from "@/stores/tasks";
import { createPullRequestAction } from "@/app/actions/vibekit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  id: string;
}

export default function TaskNavbar({ id }: Props) {
  const [isCreatingPullRequest, setIsCreatingPullRequest] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const { getTaskById, updateTask } = useTaskStore();
  const task = getTaskById(id);
  
  // Ensure title is always trimmed to avoid hydration mismatch
  const displayTitle = task?.title?.trim() || "";
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (task?.title) {
      setEditedTitle(task.title.trim());
    }
  }, [task?.title]);

  const handleCreatePullRequest = useCallback(async (isDraft: boolean = false) => {
    if (!task) return;

    setIsCreatingPullRequest(true);

    const pr = await createPullRequestAction({ task, isDraft });

    updateTask(id, {
      pullRequest: pr,
    });

    setIsCreatingPullRequest(false);
  }, [task, id, updateTask]);

  const handleCopyGitApply = useCallback(() => {
    // TODO: Implement git apply copy functionality
    console.log("Copy git apply");
  }, []);

  const handleCopyPatch = useCallback(() => {
    // TODO: Implement patch copy functionality
    console.log("Copy patch");
  }, []);

  const handleArchiveTask = useCallback(() => {
    if (!task) return;

    updateTask(id, {
      isArchived: !task.isArchived,
    });
  }, [task, id, updateTask]);

  const handleSaveTitle = useCallback(() => {
    if (!task || !editedTitle.trim()) return;

    updateTask(id, {
      title: editedTitle.trim(),
    });
    setIsEditDialogOpen(false);
  }, [task, id, updateTask, editedTitle]);

  return (
    <>
    <div className="h-14 border-b flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-x-2 min-w-0 flex-1">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft />
          </Button>
        </Link>
        <div className="h-8 border-r" />
        <div className="flex flex-col gap-x-2 ml-4 min-w-0 flex-1">
          <h3 className="font-medium truncate">{isMounted ? displayTitle : ''}</h3>
          <div className="flex items-center gap-x-0 flex-wrap">
            {isMounted && task ? (
              <>
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  {task.createdAt
                    ? formatDistanceToNow(new Date(task.createdAt), {
                        addSuffix: true,
                      })
                    : "Loading..."}
                </p>
                <Dot className="size-4 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground truncate">{task.repository}</p>
                {task.branch && (
                  <>
                    <Dot className="size-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-muted/50 dark:bg-muted/30 rounded-full backdrop-blur-sm border border-border/50">
                      <GitBranch className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">
                        {task.branch}
                      </span>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-x-2 flex-shrink-0">
        {/* More options menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit title
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleArchiveTask}>
              <Archive className="mr-2 h-4 w-4" />
              {task?.isArchived ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {task?.pullRequest ? (
          <Link href={task.pullRequest.html_url} target="_blank">
            <Button className="rounded-full">
              <GithubIcon />
              View Pull Request
            </Button>
          </Link>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="rounded-full"
                disabled={isCreatingPullRequest}
              >
                {isCreatingPullRequest ? (
                  <Loader2 className="animate-spin size-4" />
                ) : (
                  <GitBranchPlus />
                )}
                Create Pull Request
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => handleCreatePullRequest(false)}>
                <GitBranchPlus className="mr-2 h-4 w-4" />
                Create PR
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreatePullRequest(true)}>
                <GitBranchPlus className="mr-2 h-4 w-4" />
                Create PR (draft)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyGitApply}>
                <Copy className="mr-2 h-4 w-4" />
                Copy git apply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyPatch}>
                <Copy className="mr-2 h-4 w-4" />
                Copy patch
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>

    {/* Edit Title Dialog */}
    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Task Title</DialogTitle>
          <DialogDescription>
            Update the title for this task
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveTitle();
                }
              }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveTitle} disabled={!editedTitle.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
