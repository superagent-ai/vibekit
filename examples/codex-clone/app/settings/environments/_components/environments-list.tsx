"use client";
import { Dot, FolderGit, GithubIcon, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { useEnvironmentStore } from "@/stores/environments";
import { useGitHubAuth } from "@/hooks/use-github-auth";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { CreateEnvironmentDialog } from "./create-environment-dialog";

export default function EnvironmentsList() {
  const { isAuthenticated, login, isLoading } = useGitHubAuth();
  const { environments, deleteEnvironment } = useEnvironmentStore();
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

  const handleGitHubAuth = async () => {
    await login();
  };

  const handleDeleteEnvironment = (environmentId: string) => {
    if (confirm("Are you sure you want to delete this environment?")) {
      deleteEnvironment(environmentId);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto w-full flex flex-col gap-y-10 mt-14">
        <div className="flex items-center justify-between">
          <p className="font-medium">Environments</p>
          <Skeleton className="w-22 h-9" />
        </div>
        <div className="flex flex-col gap-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton className="h-20 w-full" key={index} />
          ))}
        </div>
      </div>
    );
  }

  console.log(isAuthenticated);

  return (
    <>
      <div className="max-w-2xl mx-auto w-full flex flex-col gap-y-10 mt-14">
        <div className="flex items-center justify-between">
          <p className="font-medium">Environments</p>
          {isAuthenticated ? (
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus />
              Add new
            </Button>
          ) : (
            <Button onClick={handleGitHubAuth}>
              <GithubIcon />
              Connect your Github account
            </Button>
          )}
        </div>
        {isAuthenticated ? (
          <div className="flex flex-col gap-y-4">
            {environments.map((environment) => (
              <div
                key={environment.id}
                className="flex items-center justify-between border rounded-lg p-4"
              >
                <div className="flex flex-col">
                  <p className="font-medium">{environment.name}</p>
                  <div className="flex items-center gap-x-0">
                    <Link
                      href={`https://github.com/${environment.githubRepository}`}
                      passHref
                    >
                      <div className="flex items-center gap-x-1">
                        <FolderGit className="size-4 text-muted-foreground" />
                        <p className="text-muted-foreground hover:text-primary transition-colors text-sm">
                          {environment.githubOrganization}
                        </p>
                      </div>
                    </Link>
                    {environment.createdAt && (
                      <>
                        <Dot className="text-muted-foreground/40" />
                        <p className="text-muted-foreground text-sm">
                          Created{" "}
                          {format(
                            new Date(environment.createdAt),
                            "MMM d, yyyy"
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleDeleteEnvironment(environment.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-y-4">
            <p className="text-muted-foreground">
              Connect your Github account to get started
            </p>
          </div>
        )}
      </div>
      <CreateEnvironmentDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}
