import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ProjectClientPage from "./client-page";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // read route params
  const id = (await params).id;

  const project = await fetchQuery(api.projects.getProject, {
    id: id as Id<"project">,
  });

  if (!project) {
    return {
      title: "Project Not Found | VibeKit",
      description: "The requested project could not be found",
    };
  }

  return {
    title: `${project.name || "Untitled Project"} | VibeKit`,
    description: project.name,
  };
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const { userId } = await auth();

  if (!id || !userId) {
    return notFound();
  }

  const project = await fetchQuery(api.projects.getProject, {
    id: id as Id<"project">,
  });

  if (!project) {
    return notFound();
  }

  return <ProjectClientPage project={project} userId={userId} />;
}
