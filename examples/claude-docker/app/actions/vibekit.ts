"use server";

import { Task } from "@/stores/tasks";
import { VibeKit } from "@vibe-kit/sdk";

export const runClaudeTaskAction = async ({
  task,
  dockerImage,
}: {
  task: Task;
  dockerImage?: string;
}) => {
  console.log("🚀 Starting Claude task:", {
    taskId: task.id,
    description: task.description.slice(0, 100) + "...",
    dockerImage: dockerImage || "superagentai/vibekit-claude:1.0"
  });

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  try {
    // Check Docker connectivity first
    console.log("🐳 Testing Docker connectivity...");
    const Docker = await import("dockerode");
    const docker = new Docker.default({ socketPath: "/var/run/docker.sock" });
    
    try {
      const info = await docker.info();
      console.log("✅ Docker connection successful:", {
        containers: info.Containers,
        images: info.Images,
        serverVersion: info.ServerVersion
      });
    } catch (dockerError) {
      console.error("❌ Docker connection failed:", dockerError);
      throw new Error(`Docker daemon not accessible: ${dockerError instanceof Error ? dockerError.message : String(dockerError)}`);
    }

    // List current vibekit containers
    const containers = await docker.listContainers({ 
      all: true,
      filters: {
        label: ['sh.vibekit.managed=true']
      }
    });
    console.log("📋 Current vibekit containers:", containers.map(c => ({
      id: c.Id?.slice(0, 12),
      image: c.Image,
      state: c.State,
      status: c.Status
    })));
    
    const config = {
      agent: {
        type: "claude" as const,
        model: {
          apiKey: process.env.ANTHROPIC_API_KEY,
          provider: "anthropic" as const,
        },
      },
      environment: {
        docker: {
          socketPath: "/var/run/docker.sock", // Default local Docker socket
          image: dockerImage || "superagentai/vibekit-claude:1.0", // Allow custom Docker image
        },
      },
      // Disable telemetry for this example to avoid OpenTelemetry issues
      telemetry: {
        isEnabled: false,
      },
    };

    console.log("⚙️ VibeKit config:", {
      agentType: config.agent.type,
      dockerImage: config.environment.docker.image,
    });

    console.log("🏗️ Creating VibeKit instance...");
    const vibekit = new VibeKit(config);
    const sessionId = vibekit.getSession();
    console.log("🤖 VibeKit instance created with sessionId:", sessionId);

    // Verify VibeKit container creation
    console.log("🔍 Verifying VibeKit container creation...");
    
    // Wait a bit for container to be created
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const containersAfterInit = await docker.listContainers({ all: true, filters: { label: ['sh.vibekit.managed=true'] } });
    console.log("🐳 VibeKit containers found:", containersAfterInit);

    console.log("🎯 Starting code generation...");
    
    // Add a small delay to ensure container checking logs show
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      console.log("⚡ Calling vibekit.generateCode...");
      const response = await vibekit.generateCode({
        prompt: task.description,
        mode: "code",
      });
      console.log("🎉 Code generation response received");
      
      console.log("✅ Code generation completed:", {
        exitCode: (response as { exitCode?: number })?.exitCode,
        sandboxId: (response as { sandboxId?: string })?.sandboxId,
        hasStdout: !!((response as { stdout?: string })?.stdout),
        hasStderr: !!((response as { stderr?: string })?.stderr)
      });

      // Log the actual stdout and stderr content for debugging
      const stdout = (response as { stdout?: string })?.stdout;
      const stderr = (response as { stderr?: string })?.stderr;
      
      if (stdout) {
        console.log("📄 STDOUT content:", stdout.slice(0, 1000) + (stdout.length > 1000 ? "..." : ""));
      }
      if (stderr) {
        console.log("❌ STDERR content:", stderr.slice(0, 1000) + (stderr.length > 1000 ? "..." : ""));
      }
      
      if ((response as { exitCode?: number })?.exitCode !== 0) {
        console.log("⚠️ Non-zero exit code detected. This may indicate an error in the command execution.");
      }

      // List containers after task completion
      const containersAfter = await docker.listContainers({ all: true });
      console.log("📋 Containers after task:", containersAfter.map(c => ({
        id: c.Id?.slice(0, 12),
        image: c.Image,
        state: c.State,
        status: c.Status
      })));

      return {
        success: true,
        result: response,
        sessionId: sessionId,
      };
    } catch (generateError) {
      console.error("❌ Code generation failed:", generateError);
      throw generateError;
    }
  } catch (error) {
    console.error("Claude task failed:", error);
    
    let errorMessage = "Unknown error occurred";
    if (error instanceof Error) {
      if (error.message.includes("Docker")) {
        errorMessage = `Docker error: ${error.message}. Make sure Docker is running and accessible.`;
      } else if (error.message.includes("container")) {
        errorMessage = `Container error: ${error.message}. This may be due to a missing or stopped container.`;
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};