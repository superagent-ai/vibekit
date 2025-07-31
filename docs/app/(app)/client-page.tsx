"use client";

import { useQuery, useMutation } from "convex/react";
import Image from "next/image";
import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Loader2, Plus, Zap, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/ui/color-picker";
import { FileUpload } from "@/components/ui/file-upload";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { format } from "date-fns";
import Link from "next/link";
import { useSidebar } from "@/components/navbar";
import { Doc } from "@/convex/_generated/dataModel";

const projectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be less than 100 characters"),
  logo: z.string().optional(),
  primaryColor: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

interface ClientPageProps {
  userId: string;
}

function CreateProjectModal({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}) {
  const createProject = useMutation(api.projects.createProject);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      logo: undefined,
      primaryColor: "#3b82f6",
    },
  });

  const onSubmit = async (values: ProjectFormValues) => {
    try {
      await createProject({
        name: values.name,
        createdBy: userId,
        logo: values.logo,
        primaryColor: values.primaryColor,
      });
      toast.success("Project created successfully!");
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to create project. Please try again.");
      console.error("Error creating project:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle>Create a new project</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter project name..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="logo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo</FormLabel>
                  <FormControl>
                    <FileUpload value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="primaryColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Color</FormLabel>
                  <FormControl>
                    <ColorPicker
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="#3b82f6"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {form.formState.isSubmitting ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectListItem({ project }: { project: Doc<"project"> }) {
  const agents = useQuery(api.agents.getAgentsByProjectId, {
    projectId: project._id,
  });

  return (
    <Link
      href={`/projects/${project._id}`}
      key={project._id}
      passHref
      prefetch={true}
      className="border rounded-lg bg-background hover:border-muted-foreground/50"
    >
      <div className="rounded-t-lg h-[130px] flex items-center justify-center bg-sidebar border-b">
        {project.logo ? (
          <Image
            src={project.logo}
            alt={`${project.name} logo`}
            width={48}
            height={48}
            className="object-contain"
            unoptimized={true}
          />
        ) : (
          <Image src="/projects.svg" alt="Project" width={30} height={30} />
        )}
      </div>
      <p className="px-4 font-medium mt-2">{project.name}</p>
      <div className="px-4 flex items-center justify-between gap-2 mt-2 mb-4">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Zap className="w-4 h-4" />{" "}
          <p className="text-sm">{agents?.length || 0}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {format(new Date(project._creationTime), "MMMM d, hh:mm a")}
        </p>
      </div>
    </Link>
  );
}
export default function ClientPage({ userId }: ClientPageProps) {
  const { sidebarOpen } = useSidebar();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useUser();
  const projects = useQuery(api.projects.getProjectsByUserId, {
    userId: userId,
  });

  // Filter projects based on search query
  const filteredProjects = projects?.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className={cn(
        "flex-1 transition-all duration-300 ease-in-out border bg-background mt-12 mb-4 mr-5 rounded-2xl",
        sidebarOpen ? "ml-42" : "ml-14.5"
      )}
    >
      <div className="w-full p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-lg font-medium ml-2">Projects</p>
            {!user && (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button
              onClick={() => setOpen(true)}
              variant="secondary"
              className="mr-2"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </div>
        </div>
        {filteredProjects && filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-[15%] py-12">
            <Image
              src="/projects.svg"
              alt="No projects"
              width={64}
              height={64}
              className="opacity-50 mb-4"
            />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              No projects yet
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by creating your first project.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mt-4 px-3">
          {filteredProjects?.map((project) => (
            <ProjectListItem key={project._id} project={project} />
          ))}
        </div>
      </div>
      <CreateProjectModal open={open} onOpenChange={setOpen} userId={userId} />
    </div>
  );
}
