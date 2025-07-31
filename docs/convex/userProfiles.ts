import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Create a new user profile
export const createUserProfile = mutation({
  args: {
    userId: v.string(),
    organizationId: v.optional(v.id("organization")),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("userProfile", {
      userId: args.userId,
      organizationId: args.organizationId,
    });
    return id;
  },
});

// Get a user profile by userId
export const getUserProfile = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    return profile;
  },
});

// Delete a user profile by document id
export const deleteUserProfile = mutation({
  args: { id: v.id("userProfile") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return true;
  },
});
