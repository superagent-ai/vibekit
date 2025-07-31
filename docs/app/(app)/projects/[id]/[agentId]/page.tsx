import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import AgentClientPage from "./client-page";

interface Props {
  params: Promise<{ agentId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // read route params
  const id = (await params).agentId;

  const agent = await fetchQuery(api.agents.getAgent, {
    id: id as Id<"agent">,
  });

  if (!agent) {
    return {
      title: "Agent Not Found | VibeKit",
      description: "The requested agent could not be found",
    };
  }

  return {
    title: `${agent.name || "Untitled Agent"} | VibeKit`,
    description: agent.name,
  };
}

export default async function ProjectPage({ params }: Props) {
  const { agentId } = await params;
  const { userId } = await auth();

  if (!agentId || !userId) {
    return notFound();
  }

  const agent = await fetchQuery(api.agents.getAgent, {
    id: agentId as Id<"agent">,
  });

  if (!agent) {
    return notFound();
  }

  const project = await fetchQuery(api.projects.getProject, {
    id: agent.projectId as Id<"project">,
  });

  return <AgentClientPage agent={agent} project={project!} />;
}
