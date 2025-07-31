"use client";
import { useEffect, useState, useRef } from "react";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import Image from "next/image";
import { useQuery } from "convex/react";
import {
  Check,
  Copy,
  ArrowRight,
  LucideGithub,
  Info,
  Loader2,
  ChevronsUpDown,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation } from "convex/react";

import { siteConfig } from "@/config";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Id } from "@/convex/_generated/dataModel";
import { cn, getContrastTextColor } from "@/lib/utils";
import { useGitHubAuth, type GitHubRepository } from "@/hooks/use-github";
import { createAgent } from "@/app/actions/agent";
import { fetchRealtimeSubscriptionToken } from "@/app/actions/inngest";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { api } from "@/convex/_generated/api";
import { getGithubAuth } from "@/lib/github";

interface Props {
  agentId: Id<"agent">;
  isEmbedded?: boolean;
}

const formSchema = z.object({
  repository: z.string().min(1, "Please select a repository"),
  instructions: z
    .string()
    .min(10, "Instructions must be at least 10 characters"),
});

type FormValues = z.infer<typeof formSchema>;

const statusLabels = {
  INITIALIZING: "Setting up environment",
  CLONING_REPO: "Cloning repository",
  IMPLEMENTING_CODE: "Writing code",
  CREATING_PR: "Creating pull request",
  DONE: "Pull Request created in your repository",
};

const allStatuses: Array<keyof typeof statusLabels> = [
  "INITIALIZING",
  "CLONING_REPO",
  "IMPLEMENTING_CODE",
  "CREATING_PR",
  "DONE",
];

export default function EmbedClientPage({ agentId, isEmbedded }: Props) {
  const agent = useQuery(api.agents.getAgent, { id: agentId });
  const project = useQuery(
    api.projects.getProject,
    agent?.projectId ? { id: agent.projectId } : "skip"
  );
  const [step, setStep] = useState(1);
  const [logId, setLogId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState("integration");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<
    | "INITIALIZING"
    | "CLONING_REPO"
    | "IMPLEMENTING_CODE"
    | "CREATING_PR"
    | "DONE"
    | null
  >(null);
  const [statusTimeline, setStatusTimeline] = useState<
    Array<{
      status:
        | "INITIALIZING"
        | "CLONING_REPO"
        | "IMPLEMENTING_CODE"
        | "CREATING_PR"
        | "DONE";
      timestamp: Date;
    }>
  >([]);
  const [copied, setCopied] = useState(false);
  const [repositorySelectOpen, setRepositorySelectOpen] = useState(false);
  const createActionLog = useMutation(api.actionLogs.createActionLog);
  const cardRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { latestData } = useInngestSubscription({
    refreshToken: fetchRealtimeSubscriptionToken,
    bufferInterval: 0,
    enabled: true,
  });

  if (latestData?.channel === "agents" && latestData.topic === "status") {
    if (status !== latestData.data.status && latestData.data.logId === logId) {
      const newStatus = latestData.data.status;
      setStatus(newStatus);

      // Add to timeline only if it's a new unique status
      setStatusTimeline((prev) => {
        const statusExists = prev.some((item) => item.status === newStatus);
        if (!statusExists) {
          return [...prev, { status: newStatus, timestamp: new Date() }];
        }
        return prev;
      });
    }
  }

  const {
    isAuthenticated,
    repositories,
    token,
    login,
    fetchRepositories,
    isLoading,
  } = useGitHubAuth(agent?._id as Id<"agent">);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      repository: "",
      instructions: "",
    },
  });

  // Function to send Card height to parent iframe
  const sendHeightToParent = () => {
    if (
      !isEmbedded ||
      !window.parent ||
      window.parent === window ||
      !cardRef.current
    )
      return;

    const cardHeight = cardRef.current.offsetHeight;

    window.parent.postMessage(
      {
        type: "VIBEKIT_RESIZE",
        height: cardHeight,
      },
      "*"
    );
  };

  // Send height when component mounts and content loads
  useEffect(() => {
    if (isEmbedded) {
      const timer = setTimeout(sendHeightToParent, 100);
      return () => clearTimeout(timer);
    }
  }, [isEmbedded]);

  // Send height when content-affecting state changes
  useEffect(() => {
    if (isEmbedded) {
      const timer = setTimeout(sendHeightToParent, 100);
      return () => clearTimeout(timer);
    }
  }, [
    step,
    success,
    activeTab,
    isAuthenticated,
    repositories.length,
    isEmbedded,
  ]);

  // Send height on window resize
  useEffect(() => {
    if (!isEmbedded) return;

    const handleResize = () => {
      sendHeightToParent();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("load", sendHeightToParent);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("load", sendHeightToParent);
    };
  }, [isEmbedded]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchRepositories(agentId);
    }
  }, [isAuthenticated]);

  // Focus search input when repository dropdown opens
  useEffect(() => {
    if (repositorySelectOpen && searchInputRef.current) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [repositorySelectOpen]);

  const handleGitHubAuth = async () => {
    await login(agent?._id as Id<"agent">);
  };

  const copyToClipboard = async () => {
    if (!agent?.systemPrompt) return;

    // Safely check if we're in a cross-origin iframe
    let isInCrossOriginIframe = false;
    try {
      // Try to access parent location - this will throw if cross-origin
      if (window.parent && window.parent !== window) {
        const parentOrigin = window.parent.location.origin;
        isInCrossOriginIframe = window.location.origin !== parentOrigin;
      }
    } catch {
      // If we can't access parent.location, we're definitely in a cross-origin iframe
      isInCrossOriginIframe = window.parent && window.parent !== window;
    }

    try {
      // If we're in a cross-origin iframe, skip clipboard API and use postMessage
      if (isInCrossOriginIframe) {
        throw new Error("Clipboard API blocked in cross-origin iframe");
      }

      await navigator.clipboard.writeText(agent?.systemPrompt || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Log the copy action after successful clipboard operation
      await createActionLog({
        action: "COPY_PROMPT",
        agentId: agent?._id as Id<"agent">,
        projectId: agent?.projectId as Id<"project">,
      });
    } catch {
      console.log("Clipboard API not available, using fallback method");

      // Fallback: Use postMessage to notify parent window
      if (window.parent && window.parent !== window) {
        console.log("Sending message to parent window");
        window.parent.postMessage(
          {
            type: "VIBEKIT_COPY",
            content: agent?.systemPrompt,
            format: "text",
            timestamp: Date.now(),
          },
          "*"
        );

        setCopied(true);
        setTimeout(() => setCopied(false), 2000);

        // Log the copy action after successful fallback operation
        await createActionLog({
          action: "COPY_PROMPT",
          agentId: agent?._id as Id<"agent">,
          projectId: agent?.projectId as Id<"project">,
        });
      }
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);
      const githubAuth = getGithubAuth();
      const githuUser = await githubAuth.getUser(token!);
      const _logId = await createActionLog({
        action: "CREATE_AGENT",
        agentId: agent?._id as Id<"agent">,
        projectId: agent?.projectId as Id<"project">,
        metadata: {
          githubUserProfile: {
            name: githuUser.name,
            avatar: githuUser.avatar_url,
            profileUrl: `https://github.com/${githuUser.login}`,
          },
          repository: values.repository,
          instructions: values.instructions,
        },
      });
      setLogId(_logId);

      await createAgent({
        repository: values.repository,
        instructions: values.instructions,
        prompt: agent?.systemPrompt || "",
        githubToken: token || "",
        logId: _logId,
      });

      setSuccess(true);
    } catch (error) {
      console.error("Error creating agent:", error);
      // You might want to show an error message to the user here
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!agent || !project) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center">
      <div
        className={cn(
          "w-full max-w-sm md:max-w-[800px]",
          isEmbedded && "max-w-full md:max-w-full"
        )}
      >
        <div className={cn("flex flex-col gap-6")}>
          <Card
            ref={cardRef}
            className={cn(
              "p-0 shadow-none overflow-hidden relative",
              isEmbedded && "border-none rounded-none"
            )}
          >
            <CardContent
              className={cn(
                "grid p-0 md:grid-cols-5 h-[620px]",
                isEmbedded && "h-[620px]"
              )}
            >
              <div
                className="bg-muted relative hidden md:block col-span-2 overflow-hidden min-h-full p-6 border-r"
                style={{
                  backgroundColor: agent.primaryColor || project.primaryColor,
                }}
              >
                <div className="size-10 flex items-center justify-center rounded-md overflow-hidden">
                  <Image
                    src={agent.logo || project.logo || ""}
                    alt={agent.name}
                    width="48"
                    height="48"
                  />
                </div>
                <p
                  className="font-semibold text-3xl mt-4"
                  style={{
                    color: getContrastTextColor(
                      agent.primaryColor || project.primaryColor || "#000"
                    ),
                  }}
                >
                  {agent.name}
                </p>
                <p
                  className="mt-5"
                  style={{
                    color: getContrastTextColor(
                      agent.primaryColor || project.primaryColor || "#000"
                    ),
                  }}
                >
                  {agent.descriptionText}
                </p>
                <svg
                  className="absolute inset-0 h-full w-full opacity-20"
                  viewBox="0 0 400 800"
                  preserveAspectRatio="xMidYMid slice"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <pattern
                      id="grid"
                      width="40"
                      height="40"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke={getContrastTextColor(
                          agent.primaryColor || project.primaryColor || "#000"
                        )}
                        strokeWidth="1"
                        opacity="0.3"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  <g
                    fill={getContrastTextColor(
                      agent.primaryColor || project.primaryColor || "#000"
                    )}
                    opacity="0.1"
                  >
                    <rect x="80" y="120" width="40" height="40" />
                    <rect x="240" y="200" width="40" height="40" />
                    <rect x="160" y="320" width="40" height="40" />
                    <rect x="320" y="280" width="40" height="40" />
                    <rect x="40" y="440" width="40" height="40" />
                    <rect x="280" y="480" width="40" height="40" />
                    <rect x="120" y="560" width="40" height="40" />
                    <rect x="200" y="640" width="40" height="40" />
                    <rect x="320" y="600" width="40" height="40" />
                    <rect x="80" y="720" width="40" height="40" />
                  </g>
                </svg>
              </div>
              <div className="px-6 md:px-8 pb-8 col-span-3">
                <div className="flex flex-col h-full gap-y-6">
                  <div className="flex flex-col items-center pt-6 w-full">
                    <Image
                      src={agent.logo || project.logo || ""}
                      alt={agent.name}
                      width="48"
                      height="48"
                      className="md:hidden"
                    />
                    <h1 className="text-xl font-bold mt-5">
                      {agent.headlineText}
                    </h1>
                  </div>
                  {success ? (
                    <div className="flex flex-col items-center justify-start space-y-6 flex-1">
                      <div className="w-full max-w-md space-y-4 relative flex-1 flex flex-col">
                        <div className="space-y-3 flex-1">
                          {allStatuses.map((statusKey) => {
                            const completedItem = statusTimeline.find(
                              (item) => item.status === statusKey
                            );
                            const isCompleted = !!completedItem;
                            const isCurrentStatus =
                              status === statusKey && statusKey !== "DONE";

                            // Show INITIALIZING with spinner if no status has been received yet
                            const isInitializing =
                              statusKey === "INITIALIZING" &&
                              !status &&
                              statusTimeline.length === 0;
                            const isUpcoming =
                              !isCompleted &&
                              !isCurrentStatus &&
                              !isInitializing &&
                              !(status === "DONE" && statusKey === "DONE");

                            return (
                              <div
                                key={statusKey}
                                className={`flex items-center space-x-3 p-3 bg-muted rounded-lg ${isUpcoming ? "opacity-50" : ""} ${
                                  isCurrentStatus || isInitializing
                                    ? "relative border-2 border-green-500 shadow-lg shadow-green-500/25 animate-border-pulse"
                                    : ""
                                }`}
                              >
                                <div className="flex-shrink-0">
                                  {isCurrentStatus || isInitializing ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : isCompleted ||
                                    (status === "DONE" &&
                                      statusKey === "DONE") ? (
                                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                  ) : (
                                    <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <div
                                      className={`text-sm font-medium ${isUpcoming ? "text-muted-foreground" : ""}`}
                                    >
                                      {isCurrentStatus ? (
                                        <TextShimmer>
                                          {`${statusLabels[statusKey]}...`}
                                        </TextShimmer>
                                      ) : (
                                        <p className="text-sm">
                                          {statusLabels[statusKey]}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {isCompleted
                                        ? completedItem.timestamp.toLocaleTimeString()
                                        : status === "DONE" &&
                                            statusKey === "DONE"
                                          ? "Completed"
                                          : isCurrentStatus || isInitializing
                                            ? "In progress..."
                                            : "Pending"}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-sm text-muted-foreground text-center mt-auto">
                          You may close this modal at any time
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Tabs
                      value={activeTab}
                      onValueChange={setActiveTab}
                      className="w-full h-full"
                    >
                      {step !== 2 && (
                        <TabsList className="w-full">
                          <TabsTrigger value="integration" className="w-full">
                            <LucideGithub className="size-4 mr-2" />
                            Make a PR
                          </TabsTrigger>
                          <TabsTrigger value="cursor" className="w-full">
                            <div className="*:data-[slot=avatar]:ring-background flex -space-x-1.5 *:data-[slot=avatar]:ring-2 ">
                              <Avatar className="size-4 bg-background">
                                <AvatarImage src="/devin.svg" alt="Devin" />
                              </Avatar>
                              <Avatar className="size-4 bg-background">
                                <AvatarImage src="/cursor.png" alt="Cursor" />
                              </Avatar>
                              <Avatar className="size-4 bg-background">
                                <AvatarImage
                                  src="/windsurf.svg"
                                  alt="Windsurf"
                                />
                              </Avatar>
                            </div>
                            Copy prompt
                          </TabsTrigger>
                        </TabsList>
                      )}
                      <TabsContent value="integration" className="mt-4 h-full">
                        <Form {...form}>
                          <form
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="flex flex-col gap-y-6 h-full"
                          >
                            {step === 1 && (
                              <div className="space-y-6 flex flex-col h-full">
                                <div className="flex flex-col gap-y-6 flex-1">
                                  <div>
                                    <div className="text-left">
                                      <h3 className="text-sm font-semibold">
                                        Select Repository
                                      </h3>
                                      <p className="text-sm text-muted-foreground mb-2">
                                        Connect your GitHub account to select a
                                        repository
                                      </p>
                                    </div>
                                    {!isAuthenticated ? (
                                      <div className="flex flex-col items-center space-y-4">
                                        <Button
                                          type="button"
                                          onClick={handleGitHubAuth}
                                          className="w-full"
                                          disabled={isLoading}
                                        >
                                          <LucideGithub className="w-4 h-4 mr-2" />
                                          {isLoading
                                            ? "Authenticating..."
                                            : "Authenticate with GitHub"}
                                        </Button>
                                      </div>
                                    ) : (
                                      <FormField
                                        control={form.control}
                                        name="repository"
                                        render={({ field }) => (
                                          <FormItem>
                                            <div className="relative">
                                              <FormControl>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="w-full justify-between"
                                                  onClick={() =>
                                                    setRepositorySelectOpen(
                                                      !repositorySelectOpen
                                                    )
                                                  }
                                                >
                                                  {field.value ? (
                                                    <span className="text-sm font-normal">
                                                      {field.value}
                                                    </span>
                                                  ) : (
                                                    <span className="text-sm font-normal">
                                                      Select repository...
                                                    </span>
                                                  )}
                                                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                                </Button>
                                              </FormControl>
                                              {repositorySelectOpen && (
                                                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md">
                                                  <Command>
                                                    <CommandInput
                                                      ref={searchInputRef}
                                                      placeholder="Search repository..."
                                                    />
                                                    <CommandList className="max-h-[250px] overflow-y-auto">
                                                      <CommandEmpty>
                                                        No repositories found.
                                                      </CommandEmpty>
                                                      <CommandGroup>
                                                        {repositories.map(
                                                          (
                                                            repo: GitHubRepository
                                                          ) => (
                                                            <CommandItem
                                                              key={repo.id}
                                                              value={
                                                                repo.full_name
                                                              }
                                                              onSelect={(
                                                                value
                                                              ) => {
                                                                field.onChange(
                                                                  value
                                                                );
                                                                setRepositorySelectOpen(
                                                                  false
                                                                );
                                                              }}
                                                            >
                                                              <span>
                                                                {repo.full_name}
                                                              </span>
                                                            </CommandItem>
                                                          )
                                                        )}
                                                      </CommandGroup>
                                                    </CommandList>
                                                  </Command>
                                                </div>
                                              )}
                                            </div>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-left">
                                      <h3 className="text-sm font-semibold">
                                        Add Instructions
                                      </h3>
                                      <p className="text-sm text-muted-foreground mb-2">
                                        Provide specific instructions for
                                        integrating {agent.name}
                                      </p>
                                    </div>
                                    <FormField
                                      control={form.control}
                                      name="instructions"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormControl>
                                            <Textarea
                                              placeholder={`Describe how you want ${
                                                agent.name
                                              } integrated into your app.`}
                                              className="min-h-[120px]"
                                              {...field}
                                            />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col gap-3">
                                  <div className="flex gap-3">
                                    {/* No back button on first step */}
                                    <Button
                                      type="button"
                                      onClick={() => {
                                        // Validate before going to confirmation
                                        const repo =
                                          form.getValues("repository");
                                        const instructions =
                                          form.getValues("instructions");
                                        if (!isAuthenticated) return;
                                        if (!repo) {
                                          form.setError("repository", {
                                            message:
                                              "Please select a repository",
                                          });
                                          return;
                                        }
                                        if (
                                          !instructions ||
                                          instructions.length < 10
                                        ) {
                                          form.setError("instructions", {
                                            message:
                                              "Instructions must be at least 10 characters",
                                          });
                                          return;
                                        }
                                        setStep(2);
                                      }}
                                      disabled={!isAuthenticated}
                                      variant="outline"
                                      className="w-full mt-auto"
                                      style={{
                                        backgroundColor:
                                          agent.buttonColor ||
                                          agent.primaryColor ||
                                          project.primaryColor,
                                        color: getContrastTextColor(
                                          agent.buttonColor ||
                                            agent.primaryColor ||
                                            project.primaryColor ||
                                            "#000"
                                        ),
                                      }}
                                    >
                                      {agent.showButtonLogo && (
                                        <Image
                                          src={agent.logo || project.logo || ""}
                                          alt={agent.name}
                                          width="18"
                                          height="18"
                                          style={{
                                            filter: `brightness(0) saturate(100%) invert(${
                                              getContrastTextColor(
                                                agent.buttonColor ||
                                                  agent.primaryColor ||
                                                  project.primaryColor ||
                                                  "#000"
                                              ) === "#fff"
                                                ? "1"
                                                : "0"
                                            })`,
                                          }}
                                        />
                                      )}
                                      {agent.buttonText ||
                                        siteConfig.defaultWidgetValues
                                          .buttonText}
                                      <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {step === 2 && (
                              <div className="space-y-4 flex flex-col h-full">
                                <div className="bg-muted p-4 rounded-lg space-y-2">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-sm">
                                      Repository:
                                    </span>{" "}
                                    <span className="text-muted-foreground text-sm">
                                      {form.getValues("repository")}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-sm">
                                      Instructions:
                                    </span>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {form.getValues("instructions")}
                                    </p>
                                  </div>
                                </div>

                                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                                  <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0">
                                      <LucideGithub className="w-5 h-5 text-blue-600 mt-1" />
                                    </div>
                                    <div>
                                      <h4 className="font-medium text-sm">
                                        Pull Request will be created
                                      </h4>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        A pull request will be automatically
                                        created in the repository you selected
                                        based on your instructions.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-3 pt-6 mt-auto">
                                  <div className="flex gap-3">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => setStep(1)}
                                      className="flex-1"
                                    >
                                      <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                                      Back
                                    </Button>
                                    <Button
                                      type="submit"
                                      className="flex-1"
                                      disabled={isSubmitting}
                                      style={{
                                        backgroundColor:
                                          agent.buttonColor ||
                                          agent.primaryColor ||
                                          project.primaryColor,
                                        color: getContrastTextColor(
                                          agent.buttonColor ||
                                            agent.primaryColor ||
                                            project.primaryColor ||
                                            "#000"
                                        ),
                                      }}
                                    >
                                      {isSubmitting ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      ) : (
                                        <LucideGithub className="w-4 h-4 mr-2" />
                                      )}
                                      Create Pull Request
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </form>
                        </Form>
                      </TabsContent>
                      <TabsContent value="cursor" className="space-y-4">
                        <div className="bg-muted p-4 rounded-lg space-y-4">
                          <ScrollArea className="text-sm whitespace-pre-wrap font-mono">
                            <div className="max-h-[200px]">
                              {agent.systemPrompt}
                            </div>
                          </ScrollArea>
                          <Button
                            onClick={copyToClipboard}
                            className="w-full"
                            variant="outline"
                          >
                            {copied ? (
                              <>
                                <Check className="w-4 h-4 text-green-500" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                Copy Prompt
                              </>
                            )}
                          </Button>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                          <div className="flex items-start space-x-3">
                            <div className="flex-shrink-0">
                              <Info className="size-4 text-blue-600 mt-1" />
                            </div>
                            <div>
                              <p className="text-sm text-blue-700 dark:text-blue-200">
                                Copy the prompt above and paste it into
                                Cursor&apos;s, Windsurf, Devin, VSCode etc.
                              </p>
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          {!isEmbedded && (
            <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
              By clicking continue, you agree to our{" "}
              <a href={agent.termsOfService || siteConfig.termsOfServiceUrl}>
                Terms of Service
              </a>{" "}
              and{" "}
              <a href={agent.privacyPolicy || siteConfig.privacyPolicyUrl}>
                Privacy Policy
              </a>
              .
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
