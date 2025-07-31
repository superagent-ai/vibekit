import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createAgent = mutation({
  args: {
    name: v.string(),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    createdBy: v.string(),
    projectId: v.id("project"),
    logo: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    buttonColor: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    headlineText: v.optional(v.string()),
    buttonText: v.optional(v.string()),
    descriptionText: v.optional(v.string()),
    showButtonLogo: v.optional(v.boolean()),
    privacyPolicy: v.optional(v.string()),
    termsOfService: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("agent", {
      name: args.name,
      status: args.status,
      createdBy: args.createdBy,
      projectId: args.projectId,
      logo: args.logo,
      primaryColor: args.primaryColor,
      buttonColor: args.buttonColor,
      systemPrompt: args.systemPrompt,
      headlineText: args.headlineText,
      buttonText: args.buttonText,
      descriptionText: args.descriptionText,
      showButtonLogo: args.showButtonLogo,
      privacyPolicy: args.privacyPolicy,
      termsOfService: args.termsOfService,
    });
    return id;
  },
});

export const getAgent = query({
  args: { id: v.id("agent") },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.id);
    return agent;
  },
});

export const updateAgent = mutation({
  args: {
    id: v.id("agent"),
    name: v.string(),
    logo: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    buttonColor: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    headlineText: v.optional(v.string()),
    buttonText: v.optional(v.string()),
    descriptionText: v.optional(v.string()),
    showButtonLogo: v.optional(v.boolean()),
    privacyPolicy: v.optional(v.string()),
    termsOfService: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updateFields: {
      name: string;
      logo?: string;
      primaryColor?: string;
      buttonColor?: string;
      systemPrompt?: string;
      headlineText?: string;
      buttonText?: string;
      descriptionText?: string;
      showButtonLogo?: boolean;
      privacyPolicy?: string;
      termsOfService?: string;
    } = {
      name: args.name,
    };

    // Only add optional fields if they are present
    if (args.logo !== undefined) updateFields.logo = args.logo;
    if (args.primaryColor !== undefined)
      updateFields.primaryColor = args.primaryColor;
    if (args.systemPrompt !== undefined)
      updateFields.systemPrompt = args.systemPrompt;
    if (args.headlineText !== undefined)
      updateFields.headlineText = args.headlineText;
    if (args.buttonText !== undefined)
      updateFields.buttonText = args.buttonText;
    if (args.descriptionText !== undefined)
      updateFields.descriptionText = args.descriptionText;
    if (args.showButtonLogo !== undefined)
      updateFields.showButtonLogo = args.showButtonLogo;
    if (args.privacyPolicy !== undefined)
      updateFields.privacyPolicy = args.privacyPolicy;
    if (args.termsOfService !== undefined)
      updateFields.termsOfService = args.termsOfService;
    if (args.buttonColor !== undefined)
      updateFields.buttonColor = args.buttonColor;
    await ctx.db.patch(args.id, updateFields);
    return true;
  },
});

export const updateAgentName = mutation({
  args: {
    id: v.id("agent"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
    });
    return true;
  },
});

export const deleteAgent = mutation({
  args: { id: v.id("agent") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return true;
  },
});

export const getAgentsByProjectId = query({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agent")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return agents;
  },
});

export const getAgentsByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agent")
      .withIndex("by_user", (q) => q.eq("createdBy", args.userId))
      .collect();
    return agents;
  },
});

export const getAgentByProjectAndUser = query({
  args: {
    projectId: v.id("project"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agent")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("createdBy"), args.userId))
      .first();
    return agent;
  },
});
