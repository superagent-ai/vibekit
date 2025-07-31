import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// CREATE - Create an action log
export const createActionLog = mutation({
  args: {
    action: v.union(v.literal("COPY_PROMPT"), v.literal("CREATE_AGENT")),
    agentId: v.id("agent"),
    projectId: v.id("project"),
    metadata: v.optional(
      v.object({
        repository: v.optional(v.string()),
        instructions: v.optional(v.string()),
        githubUserProfile: v.optional(
          v.object({
            name: v.optional(v.string()),
            avatar: v.optional(v.string()),
            profileUrl: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("actionLog", {
      action: args.action,
      agentId: args.agentId,
      projectId: args.projectId,
      metadata: args.metadata,
    });
    return id;
  },
});

// READ - Get a single action log by ID
export const getActionLog = query({
  args: { id: v.id("actionLog") },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.id);
    return log;
  },
});

// READ - Get all action logs
export const getAllActionLogs = query({
  args: {},
  handler: async (ctx) => {
    const logs = await ctx.db.query("actionLog").order("desc").collect();
    return logs;
  },
});

// READ - Get action logs by agent
export const getLogsByAgent = query({
  args: { agentId: v.id("agent") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("actionLog")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .collect();
    return logs;
  },
});

// READ - Get action logs by project
export const getLogsByProject = query({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("actionLog")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    return logs;
  },
});

// READ - Get action logs by action type
export const getLogsByAction = query({
  args: {
    action: v.union(v.literal("COPY_PROMPT"), v.literal("CREATE_AGENT")),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("actionLog")
      .withIndex("by_action", (q) => q.eq("action", args.action))
      .order("desc")
      .collect();
    return logs;
  },
});

// READ - Get action logs count
export const getActionLogCount = query({
  args: {},
  handler: async (ctx) => {
    const logs = await ctx.db.query("actionLog").collect();
    return logs.length;
  },
});

// UPDATE - Update action log metadata
export const updateActionLog = mutation({
  args: {
    id: v.id("actionLog"),
    metadata: v.optional(
      v.object({
        repository: v.optional(v.string()),
        instructions: v.optional(v.string()),
        githubUserProfile: v.optional(
          v.object({
            name: v.optional(v.string()),
            avatar: v.optional(v.string()),
            profileUrl: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Action log not found");
    }

    await ctx.db.patch(args.id, {
      metadata: args.metadata,
    });
    return true;
  },
});

// UPDATE - Add metadata to existing action log
export const addMetadataToActionLog = mutation({
  args: {
    id: v.id("actionLog"),
    additionalMetadata: v.object({
      repository: v.optional(v.string()),
      instructions: v.optional(v.string()),
      githubUserProfile: v.optional(
        v.object({
          name: v.optional(v.string()),
          avatar: v.optional(v.string()),
          profileUrl: v.optional(v.string()),
        })
      ),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Action log not found");
    }

    // Merge existing metadata with new metadata
    const updatedMetadata = {
      ...existing.metadata,
      ...args.additionalMetadata,
    };

    await ctx.db.patch(args.id, {
      metadata: updatedMetadata,
    });
    return true;
  },
});

// DELETE - Delete a single action log
export const deleteActionLog = mutation({
  args: { id: v.id("actionLog") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Action log not found");
    }

    await ctx.db.delete(args.id);
    return true;
  },
});

// DELETE - Delete action logs by agent
export const deleteLogsByAgent = mutation({
  args: { agentId: v.id("agent") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("actionLog")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();

    let deletedCount = 0;
    for (const log of logs) {
      await ctx.db.delete(log._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// DELETE - Delete action logs by project
export const deleteLogsByProject = mutation({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("actionLog")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    let deletedCount = 0;
    for (const log of logs) {
      await ctx.db.delete(log._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// DELETE - Bulk delete action logs by IDs
export const bulkDeleteActionLogs = mutation({
  args: { ids: v.array(v.id("actionLog")) },
  handler: async (ctx, args) => {
    let deletedCount = 0;
    let failedCount = 0;

    for (const id of args.ids) {
      try {
        const existing = await ctx.db.get(id);
        if (existing) {
          await ctx.db.delete(id);
          deletedCount++;
        } else {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    return { deletedCount, failedCount };
  },
});

// READ - Get action logs for a user's organization
export const getLogsByUserOrganization = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Step 1: Get the user's profile to find their organization
    const userProfile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!userProfile || !userProfile.organizationId) {
      // User has no organization, return empty array
      return [];
    }

    // Step 2: Get all users connected to the same organization
    const orgUsers = await ctx.db
      .query("userProfile")
      .filter((q) =>
        q.eq(q.field("organizationId"), userProfile.organizationId)
      )
      .collect();

    if (orgUsers.length === 0) {
      return [];
    }

    // Step 3: Get all agents for each user in the organization
    const allAgents = [];
    for (const user of orgUsers) {
      const userAgents = await ctx.db
        .query("agent")
        .withIndex("by_user", (q) => q.eq("createdBy", user.userId))
        .collect();
      allAgents.push(...userAgents);
    }

    if (allAgents.length === 0) {
      return [];
    }

    // Step 4: Get all action logs for all those agents
    const allLogs = [];
    for (const agent of allAgents) {
      const agentLogs = await ctx.db
        .query("actionLog")
        .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
        .collect();
      allLogs.push(...agentLogs);
    }

    // Sort by creation time (most recent first)
    allLogs.sort((a, b) => b._creationTime - a._creationTime);

    return allLogs;
  },
});
