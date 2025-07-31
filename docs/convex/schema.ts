import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  organization: defineTable({
    name: v.string(),
    createdBy: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  }).index("by_user", ["createdBy"]),
  userProfile: defineTable(
    v.object({
      userId: v.string(),
      organizationId: v.optional(v.id("organization")),
    })
  ).index("by_user", ["userId"]),
  project: defineTable({
    name: v.string(),
    createdBy: v.string(),
    logo: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    githubClientId: v.optional(v.string()),
    githubClientSecret: v.optional(v.string()),
  }).index("by_user", ["createdBy"]),
  agent: defineTable({
    name: v.string(),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    createdBy: v.string(),
    projectId: v.id("project"),
    logo: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    buttonColor: v.optional(v.string()),
    headlineText: v.optional(v.string()),
    buttonText: v.optional(v.string()),
    descriptionText: v.optional(v.string()),
    showButtonLogo: v.optional(v.boolean()),
    privacyPolicy: v.optional(v.string()),
    termsOfService: v.optional(v.string()),
  })
    .index("by_user", ["createdBy"])
    .index("by_project", ["projectId"]),
  actionLog: defineTable({
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
  })
    .index("by_agent", ["agentId"])
    .index("by_project", ["projectId"])
    .index("by_action", ["action"]),
});
