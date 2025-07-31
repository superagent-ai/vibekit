import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createProject = mutation({
  args: {
    name: v.string(),
    createdBy: v.string(),
    logo: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("project", {
      name: args.name,
      createdBy: args.createdBy,
      logo: args.logo,
      primaryColor: args.primaryColor,
    });
    return id;
  },
});

export const getProject = query({
  args: { id: v.id("project") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    return project;
  },
});

export const updateProject = mutation({
  args: {
    id: v.id("project"),
    name: v.string(),
    logo: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    githubClientId: v.optional(v.string()),
    githubClientSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
      logo: args.logo,
      primaryColor: args.primaryColor,
      githubClientId: args.githubClientId,
      githubClientSecret: args.githubClientSecret,
    });
    return true;
  },
});

export const getProjectByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("project")
      .withIndex("by_user", (q) => q.eq("createdBy", args.userId))
      .first();
    return project;
  },
});

export const getProjectsByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_user", (q) => q.eq("createdBy", args.userId))
      .collect();
    return projects;
  },
});

export const deleteProject = mutation({
  args: { id: v.id("project") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return true;
  },
});
