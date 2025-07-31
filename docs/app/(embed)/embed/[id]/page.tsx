import { notFound } from "next/navigation";
import { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import EmbedClientPage from "./client-page";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // read route params
  const id = (await params).id;

  const agent = await fetchQuery(api.agents.getAgent, {
    id: id as Id<"agent">,
  });

  if (!agent) {
    return {
      title: "Link not found | VibeKit",
      description: "The requested link could not be found",
    };
  }

  return {
    title: `${agent.headlineText} | VibeKit`,
    description: agent.descriptionText,
  };
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  // Check if embed mode is enabled via search params
  const isEmbedded =
    resolvedSearchParams?.embed === "true" ||
    resolvedSearchParams?.embed === "1";

  if (!id) {
    return notFound();
  }

  // Just validate that the agent exists, but let client fetch the data
  const agent = await fetchQuery(api.agents.getAgent, {
    id: id as Id<"agent">,
  });

  if (!agent) {
    return notFound();
  }

  return (
    <EmbedClientPage agentId={id as Id<"agent">} isEmbedded={isEmbedded} />
  );
}
