"use client";
import { ArrowLeft, Plus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/navbar";

export default function ProjectClientPage({
  project,
  userId,
}: {
  project: Doc<"project">;
  userId: string;
}) {
  const { sidebarOpen } = useSidebar();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const router = useRouter();
  const createAgent = useMutation(api.agents.createAgent);
  const agents = useQuery(api.agents.getAgentsByProjectId, {
    projectId: project._id,
  });

  const createNewAgent = useCallback(async () => {
    setIsLoading(true);
    const agent = await createAgent({
      name: "Untitled Agent",
      status: "INACTIVE",
      projectId: project._id,
      createdBy: userId,
    });

    router.push(`/projects/${project._id}/${agent}`);
    setIsLoading(false);
  }, [createAgent, project._id, userId, router]);

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
            <Link passHref href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-lg flex items-center justify-center bg-sidebar">
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
          </div>
          <Button onClick={createNewAgent} variant="secondary" className="mr-2">
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Plus />}{" "}
            New agent
          </Button>
        </div>

        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mt-6 px-3">
          {agents?.map((agent) => (
            <Link
              href={`/projects/${project._id}/${agent._id}`}
              key={agent._id}
              passHref
              prefetch={true}
              className="border rounded-lg bg-background hover:border-muted-foreground/50"
            >
              <div className="rounded-t-lg h-[130px] flex items-center justify-center bg-sidebar border-b">
                {agent.logo ? (
                  <Image
                    src={agent.logo}
                    alt={`${agent.name} logo`}
                    width={48}
                    height={48}
                    className="object-contain"
                    unoptimized={true}
                  />
                ) : (
                  <Image
                    src="/projects.svg"
                    alt="Agent"
                    width={30}
                    height={30}
                  />
                )}
              </div>
              <p className="px-4 font-medium mt-2">{agent.name}</p>
              <div className="px-4 flex items-center justify-between gap-2 mt-2 mb-4">
                {/* <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <div
                    className={cn(
                      "size-2    rounded-full",
                      agent.status === "ACTIVE" ? "bg-blue-500" : "bg-gray-500"
                    )}
                  />
                  <p className="text-sm">
                    {agent.status.charAt(0).toUpperCase() +
                      agent.status.slice(1).toLowerCase()}
                  </p>
                </div> */}
                <p className="text-sm text-muted-foreground">
                  {format(new Date(agent._creationTime), "MMM d, hh:mm a")}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Empty State */}
        {agents && agents.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-[15%] py-12">
            <Image
              src="/projects.svg"
              alt="No agents"
              width={64}
              height={64}
              className="opacity-50 mb-4"
            />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              No agents yet
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by creating your first agent for this project.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
