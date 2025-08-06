"use client";

import { ArrowUp, FolderGit2, Loader } from "lucide-react";
import { Repo } from "@/app/actions/github";
import { useRef, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listRepos } from "@/app/actions/github";

type FormData = {
  message: string;
  repository?: string;
};

interface ChatFormProps {
  onSubmit: (message: string, repository?: Repo) => void | Promise<void>;
  showRepositories?: boolean;
}

export default function ChatForm({
  onSubmit,
  showRepositories = false,
}: ChatFormProps) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState<boolean>(false);
  const [selectedRepo, setSelectedRepo] = useState<Repo | undefined>();

  useEffect(() => {
    if (showRepositories) {
      const fetchRepos = async () => {
        setIsLoadingRepos(true);
        try {
          const repos = await listRepos();
          setRepos(repos as Repo[]);
        } catch (error) {
          console.error("Failed to fetch repositories:", error);
        } finally {
          setIsLoadingRepos(false);
        }
      };
      fetchRepos();
    }
  }, [showRepositories]);

  const { register, handleSubmit, reset, watch, formState, setValue } =
    useForm<FormData>({
      defaultValues: {
        message: "",
        repository: "",
      },
    });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  const messageValue = watch("message");
  const isMessageEmpty = !messageValue || messageValue.trim().length === 0;
  const { isSubmitting } = formState;

  // Combine both loading states
  const isFormSubmitting = isSubmitting || isLoading;

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isMessageEmpty && !isFormSubmitting) {
        handleSubmit(handleFormSubmit)();
      }
    }
  };

  const handleRepositoryChange = (repoId: string) => {
    const repo = repos.find((r) => r.id.toString() === repoId);
    setSelectedRepo(repo);
    setValue("repository", repoId);
  };

  const handleFormSubmit = async (data: FormData) => {
    if (!data.message.trim()) return;

    setIsLoading(true);
    try {
      await onSubmit(data.message.trim(), selectedRepo);
      reset();
      setSelectedRepo(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  // Group repositories by organization/owner
  const groupedRepos = repos.reduce(
    (acc, repo) => {
      const owner = repo.full_name.split("/")[0];
      if (!acc[owner]) {
        acc[owner] = [];
      }
      acc[owner].push(repo);
      return acc;
    },
    {} as Record<string, Repo[]>
  );

  // Sort organizations alphabetically
  const sortedOrgs = Object.keys(groupedRepos).sort();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "56px";
    }
  }, []);

  // Combine register with ref
  const { ref, ...registerProps } = register("message", { required: true });

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="rounded-lg border p-4 flex flex-col justify-between bg-background"
    >
      <textarea
        {...registerProps}
        ref={(e) => {
          ref(e);
          textareaRef.current = e;
        }}
        className="w-full resize-none focus:outline-none text-sm min-h-14 overflow-hidden"
        placeholder="Ask vibe0 to build..."
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        disabled={isFormSubmitting}
      />
      <div className="flex items-center justify-between">
        {showRepositories && (
          <div className="mb-">
            {isLoadingRepos ? (
              <Skeleton className="w-[200px] h-9" />
            ) : (
              <Select
                onValueChange={handleRepositoryChange}
                value={selectedRepo?.id.toString() || ""}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a repository (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {sortedOrgs.map((org) => (
                    <SelectGroup key={org}>
                      <SelectLabel>
                        {org} ({groupedRepos[org].length})
                      </SelectLabel>
                      {groupedRepos[org].map((repo) => (
                        <SelectItem key={repo.id} value={repo.id.toString()}>
                          <div className="flex items-center gap-2">
                            <FolderGit2 />
                            <span className="font-medium">{repo.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        <Button
          size="icon"
          className="ml-auto size-8"
          type="submit"
          disabled={isMessageEmpty || isFormSubmitting}
        >
          {isFormSubmitting ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
  );
}
