import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createOrganization = mutation({
  args: {
    name: v.string(),
    createdBy: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("organization", {
      name: args.name,
      createdBy: args.createdBy,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
    });
    return id;
  },
});

export const getOrganization = query({
  args: { id: v.id("organization") },
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.id);
    return organization;
  },
});

export const updateOrganization = mutation({
  args: {
    id: v.id("organization"),
    name: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
    });
    return true;
  },
});

export const getOrganizationByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const organization = await ctx.db
      .query("organization")
      .withIndex("by_user", (q) => q.eq("createdBy", args.userId))
      .first();
    return organization;
  },
});

export const deleteOrganization = mutation({
  args: { id: v.id("organization") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return true;
  },
});
