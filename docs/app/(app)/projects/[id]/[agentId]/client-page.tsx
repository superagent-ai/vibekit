"use client";

import {
  ArrowLeft,
  ChevronRight,
  Edit3,
  Loader2,
  Trash2,
  Box,
  Link2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "convex/react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import AgentDetails from "./_components/agent-details";
import { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import Preview from "./_components/preview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SDK from "./_components/sdk";
import Mintlify from "./_components/mintlify";

interface Props {
  agent: Doc<"agent">;
  project: Doc<"project">;
}

export default function AgentClientPage({ agent, project }: Props) {
  const [unsavedChanges, setUnsavedChanges] = useState<boolean>(false);
  const router = useRouter();
  const { sidebarOpen } = useSidebar();
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formFields, setFormFields] = useState<
    Record<string, string | boolean>
  >({});
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(agent.name);
  const [isHovering, setIsHovering] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateAgentName = useMutation(api.agents.updateAgentName);
  const updateAgent = useMutation(api.agents.updateAgent);
  const updateProject = useMutation(api.projects.updateProject);
  const deleteAgent = useMutation(api.agents.deleteAgent);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameEdit = () => {
    setIsEditingName(true);
  };

  const handleNameSave = async () => {
    if (editedName.trim() && editedName !== agent.name) {
      try {
        await updateAgentName({
          id: agent._id,
          name: editedName.trim(),
        });
        // Refresh the page data to get the updated agent name
        router.refresh();
      } catch (error) {
        console.error("Failed to update agent name:", error);
        // Revert to original name on error
        setEditedName(agent.name);
      }
    }
    setIsEditingName(false);
    setIsHovering(false);
  };

  const handleNameCancel = () => {
    setEditedName(agent.name);
    setIsEditingName(false);
    setIsHovering(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNameSave();
    } else if (e.key === "Escape") {
      handleNameCancel();
    }
  };

  const handleSave = useCallback(
    async (additionalFields?: Record<string, string | boolean>) => {
      setIsSaving(true);

      try {
        // Merge current formFields with any additional fields passed in
        const allFields = { ...formFields, ...additionalFields };

        // Separate GitHub fields for project vs agent fields
        const githubFields: Record<string, string> = {};
        const agentFields: Record<string, string | boolean> = {};

        Object.entries(allFields).forEach(([key, value]) => {
          if (key === "githubClientId" || key === "githubClientSecret") {
            githubFields[key] = value as string;
          } else {
            agentFields[key] =
              typeof value === "string" &&
              (value === "true" || value === "false")
                ? value === "true"
                : value;
          }
        });

        // Update project with GitHub fields if any exist
        if (Object.keys(githubFields).length > 0) {
          await updateProject({
            id: project._id,
            name: project.name,
            logo: project.logo,
            primaryColor: project.primaryColor,
            ...githubFields,
          });
        }

        // Update agent with remaining fields
        if (Object.keys(agentFields).length > 0) {
          await updateAgent({
            id: agent._id,
            name: editedName,
            ...agentFields,
          });
        }
      } finally {
        setIsSaving(false);
        setUnsavedChanges(false);
        router.refresh();
      }
    },
    [formFields, agent, project, updateAgent, updateProject, router, editedName]
  );

  const handleSaveClick = () => handleSave();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAgent({ id: agent._id });
      router.push(`/projects/${project._id}`);
    } catch (error) {
      console.error("Failed to delete agent:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div
      className={cn(
        "flex-1 transition-all duration-300 ease-in-out grid grid-cols-1 md:grid-cols-4 mt-12 mb-4 mr-5 rounded-2xl",
        sidebarOpen ? "ml-42" : "ml-14.5"
      )}
    >
      <div className="flex flex-col col-span-2 rounded-xl border bg-background">
        <div className="w-full p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link passHref href={`/projects/${agent.projectId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft />
                </Button>
              </Link>
              <Link
                passHref
                href={`/projects/${agent.projectId}`}
                className="hover:opacity-50 transition-all duration-300"
              >
                <div className="flex items-center gap-2">
                  <div className="size-9 rounded-lg flex items-center justify-center bg-sidebar ">
                    {project.logo ? (
                      <Image
                        src={project.logo}
                        alt={`${project.name} logo`}
                        width={22}
                        height={22}
                        className="object-contain"
                        unoptimized={true}
                      />
                    ) : (
                      <Image
                        src="/projects.svg"
                        alt="Project"
                        width={20}
                        height={20}
                      />
                    )}
                  </div>
                  <p className="text-lg font-medium">{project.name}</p>
                </div>
              </Link>
              <ChevronRight className="text-muted-foreground/50" />
              <div className="flex items-center gap-2 -ml-2">
                {isEditingName ? (
                  <div className="flex items-center gap-1 rounded px-2 py-1">
                    <input
                      ref={inputRef}
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onBlur={handleNameSave}
                      onKeyDown={handleKeyDown}
                      className="text-lg font-medium bg-transparent focus:outline-none border-none outline-none"
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "flex items-center gap-1 cursor-pointer rounded px-2 py-1 transition-all duration-200",
                      isHovering && "bg-muted"
                    )}
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                    onClick={handleNameEdit}
                  >
                    <p className="text-lg font-medium">{editedName}</p>
                    {isHovering && (
                      <Edit3 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 mr-2">
              {unsavedChanges && (
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-orange-300" />
                  <p className="text-sm text-muted-foreground">
                    Unsaved changes
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setShowDeleteModal(true)}
                >
                  <Trash2 className="size-4" />
                </Button>
                <Button variant="secondary" onClick={handleSaveClick}>
                  {isSaving && <Loader2 className="size-4 animate-spin" />} Save
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 flex-1">
          <AgentDetails
            agent={agent}
            project={project}
            onChange={(value) => {
              if (
                value.key === "systemPrompt" ||
                value.key === "githubClientId" ||
                value.key === "githubClientSecret" ||
                value.key === "privacyPolicy" ||
                value.key === "termsOfService"
              ) {
                setUnsavedChanges(true);
                setFormFields((prev) => ({
                  ...prev,
                  [value.key]: value.value,
                }));

                return;
              }

              setFormFields((prev) => ({
                ...prev,
                [value.key]: value.value,
              }));

              // Pass the new field directly to avoid race condition with state update
              handleSave({ [value.key]: value.value });
            }}
          />
        </div>
      </div>
      <div className="h-full col-span-2">
        <Tabs defaultValue="preview" className="w-full h-full">
          <TabsList className="mx-auto w-fit bg-sidebar">
            <TabsTrigger
              value="preview"
              className="text-md flex items-center gap-1 w-fit"
            >
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Link
            </TabsTrigger>
            <TabsTrigger
              value="sdk"
              className="text-md flex items-center gap-1 w-fit"
            >
              <Box className="h-4 w-4 text-muted-foreground" />
              SDK
            </TabsTrigger>
            <TabsTrigger
              value="mintlify"
              className="text-md flex items-center gap-1 w-[140px]"
            >
              <Image
                src="/mintlify.svg"
                alt="Mintlify"
                width={15}
                height={15}
              />
              Mintlify
            </TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="w-full h-full">
            <Preview agent={agent} />
          </TabsContent>
          <TabsContent value="mintlify" className="w-full h-full">
            <Mintlify agent={agent} />
          </TabsContent>
          <TabsContent value="sdk" className="w-full h-full">
            <div className="max-w-3xl w-full mx-auto h-full flex items-center justify-center">
              <SDK agent={agent} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{agent.name}&rdquo;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="size-4 animate-spin mr-2" />}
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
