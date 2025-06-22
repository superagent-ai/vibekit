"use server";
import { cookies } from "next/headers";
import { getSubscriptionToken, Realtime } from "@inngest/realtime";

import { inngest } from "@/lib/inngest";
import { Task } from "@/stores/tasks";
import { getInngestApp, taskChannel } from "@/lib/inngest";

export type TaskChannelToken = Realtime.Token<
  typeof taskChannel,
  ["status", "update"]
>;

export const createTaskAction = async ({
  task,
  sessionId,
  prompt,
}: {
  task: Task;
  sessionId?: string;
  prompt?: string;
}) => {
  const cookieStore = await cookies();
  const githubToken = cookieStore.get("github_access_token")?.value;

  if (!githubToken) {
    throw new Error("No GitHub token found. Please authenticate first.");
  }

  await inngest.send({
    name: "clonedex/create.task",
    data: {
      task,
      token: githubToken,
      sessionId: sessionId,
      prompt: prompt,
    },
  });
};

export const createPullRequestAction = async ({
  sessionId,
}: {
  sessionId?: string;
}) => {
  const cookieStore = await cookies();
  const githubToken = cookieStore.get("github_access_token")?.value;

  if (!githubToken) {
    throw new Error("No GitHub token found. Please authenticate first.");
  }

  await inngest.send({
    name: "clonedex/create.pull-request",
    data: {
      token: githubToken,
      sessionId: sessionId,
    },
  });
};

export async function fetchRealtimeSubscriptionToken(): Promise<TaskChannelToken> {
  const token = await getSubscriptionToken(getInngestApp(), {
    channel: taskChannel(),
    topics: ["status", "update"],
  });

  return token;
}

// E2B Container Management Actions
// List all available E2B sandboxes
export const listE2BSandboxesAction = async () => {
  try {
    console.log('[listE2BSandboxesAction] Fetching all E2B sandboxes');
    console.log('[listE2BSandboxesAction] E2B API Key available:', !!process.env.E2B_API_KEY);

    const response = await fetch('https://api.e2b.dev/sandboxes', {
      method: 'GET',
      headers: {
        'X-API-KEY': process.env.E2B_API_KEY!,
        'Content-Type': 'application/json',
      },
    });

    console.log('[listE2BSandboxesAction] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[listE2BSandboxesAction] Error response body:', errorText);
      throw new Error(`Failed to list E2B sandboxes: ${response.status} ${response.statusText}`);
    }

    const sandboxes = await response.json();
    console.log('[listE2BSandboxesAction] Found sandboxes:', sandboxes);

    // Filter and format sandbox data for UI
    const activeSandboxes = (Array.isArray(sandboxes) ? sandboxes : [])
      .filter(sandbox => sandbox.status === 'running' || sandbox.status === 'active')
      .map(sandbox => ({
        id: sandbox.id || sandbox.sandboxId,
        status: sandbox.status,
        template: sandbox.template || 'unknown',
        createdAt: sandbox.createdAt,
        expiresAt: sandbox.expiresAt,
        url: `https://${sandbox.id || sandbox.sandboxId}.e2b.dev`,
        displayName: `${sandbox.template || 'unknown'} (${(sandbox.id || sandbox.sandboxId)?.substring(0, 8)}...)`
      }));

    return activeSandboxes;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[listE2BSandboxesAction] Failed to list E2B sandboxes:', errorMessage);
    return []; // Return empty array on error to prevent UI crashes
  }
};

export const getE2BContainerConnectionsAction = async (sandboxId: string) => {
  try {
    console.log('[getE2BContainerConnectionsAction] Fetching connection URLs for:', sandboxId);
    
    // Validate sandboxId format first
    if (!sandboxId || sandboxId.length === 0) {
      console.log('[getE2BContainerConnectionsAction] Invalid sandboxId provided');
      return null;
    }
    
    // Check if this looks like a UUID (not an E2B sandbox ID)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(sandboxId)) {
      console.log('[getE2BContainerConnectionsAction] sandboxId is a UUID, not an E2B sandbox ID. Sandbox creation likely failed.');
      return null;
    }
    
    // Get container details first
    const response = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
      method: 'GET',
      headers: {
        'X-API-KEY': process.env.E2B_API_KEY!,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[getE2BContainerConnectionsAction] Container not found, returning null');
        return null;
      }
      throw new Error(`Failed to get container: ${response.status} ${response.statusText}`);
    }
    
    const container = await response.json();
    
    // E2B provides different connection methods
    const connections = {
      sandboxId,
      status: container.status,
      // Web-based terminal access
      webTerminalUrl: `https://${sandboxId}.e2b.dev/terminal`,
      // Code server (VS Code in browser)
      codeServerUrl: `https://${sandboxId}.e2b.dev/code`,
      // Direct sandbox URL
      sandboxUrl: `https://${sandboxId}.e2b.dev`,
      // SSH connection info (if available)
      sshInfo: container.ssh || null,
      // Environment info
      environment: container.template || 'unknown',
      createdAt: container.createdAt,
      // Any exposed ports
      ports: container.ports || [],
    };

    console.log('[getE2BContainerConnectionsAction] Connection info:', connections);
    return connections;
  } catch (error) {
    console.error('[getE2BContainerConnectionsAction] Failed to get connection info:', error);
    
    // Check if this is a 404 error from a nested call
    if (error instanceof Error && error.message.includes('404')) {
      console.log('[getE2BContainerConnectionsAction] Container not found (404), returning null');
      return null;
    }
    
    // Don't throw, return null to prevent client-side errors
    return null;
  }
};

export const cleanupE2BSandboxAction = async (sandboxId: string) => {
  try {
    console.log('[cleanupE2BSandboxAction] Cleaning up sandbox:', sandboxId);
    const response = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
      method: 'DELETE',
      headers: {
        'X-API-KEY': process.env.E2B_API_KEY!,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to cleanup sandbox: ${response.statusText}`);
    }
    
    console.log('[cleanupE2BSandboxAction] Sandbox cleaned up successfully');
    return { success: true };
  } catch (error) {
    console.error('[cleanupE2BSandboxAction] Failed to cleanup sandbox:', error);
    throw error;
  }
};

export const reactivateE2BSandboxAction = async (sandboxId: string) => {
  try {
    console.log('[reactivateE2BSandboxAction] Reactivating sandbox:', sandboxId);
    
    // First check if sandbox exists
    const checkResponse = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
      method: 'GET',
      headers: {
        'X-API-KEY': process.env.E2B_API_KEY!,
        'Content-Type': 'application/json',
      },
    });

    if (checkResponse.ok) {
      console.log('[reactivateE2BSandboxAction] Sandbox still exists, attempting to resume via SDK');
      // Sandbox exists, use SDK to resume (no extend endpoint exists)
      try {
        const { Sandbox } = await import('@e2b/code-interpreter');
        
        const sandbox = await Sandbox.resume(sandboxId, {
          timeoutMs: 60 * 60 * 1000, // 1 hour (maximum allowed by E2B)
        });

        console.log('[reactivateE2BSandboxAction] Sandbox resumed successfully');
        return { 
          success: true, 
          action: 'resumed',
          sandboxId: sandbox.sandboxId 
        };
      } catch (resumeError) {
        console.error('[reactivateE2BSandboxAction] Failed to resume sandbox:', resumeError);
        // If resume fails, we'll try to recreate below
      }
    }
  } catch (error) {
    console.error('[reactivateE2BSandboxAction] Failed to reactivate sandbox:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Provide user-friendly error messages
    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
      throw new Error('Sandbox has expired or been cleaned up. Please create a new task to get a fresh sandbox.');
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      throw new Error('Sandbox timeout cannot exceed 1 hour (E2B limitation). Please create a new task for a fresh sandbox.');
    }
    
    throw new Error(`Failed to reactivate sandbox: ${errorMessage}`);
  }
};
