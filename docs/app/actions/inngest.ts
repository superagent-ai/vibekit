"use server";
import { getSubscriptionToken, Realtime } from "@inngest/realtime";

import { getInngestApp, agentChannel } from "@/lib/inngest";

export type AgentChannelToken = Realtime.Token<typeof agentChannel, ["status"]>;

export async function fetchRealtimeSubscriptionToken(): Promise<AgentChannelToken> {
  const token = await getSubscriptionToken(getInngestApp(), {
    channel: agentChannel(),
    topics: ["status"],
  });

  return token;
}
