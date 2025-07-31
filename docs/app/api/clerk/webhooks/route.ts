import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);
    const { id } = evt.data;
    const eventType = evt.type;

    switch (eventType) {
      case "user.created":
        const stripeCustomer = await stripe.customers.create({
          email: evt.data.email_addresses[0].email_address,
        });

        const stripeSubscription = await stripe.subscriptions.create({
          customer: stripeCustomer.id,
          items: [
            {
              price: process.env.NEXT_PUBLIC_STRIPE_FREE_PLAN_PRICE_ID,
            },
          ],
        });

        const newOrganization = await fetchMutation(
          api.organizations.createOrganization,
          {
            name: "Default",
            createdBy: id!,
            stripeCustomerId: stripeCustomer.id,
            stripeSubscriptionId: stripeSubscription.id,
          }
        );

        await fetchMutation(api.userProfiles.createUserProfile, {
          userId: id!,
          organizationId: newOrganization,
        });
        break;
      case "user.deleted":
        const existingOrganization = await fetchQuery(
          api.organizations.getOrganizationByUserId,
          {
            userId: id!,
          }
        );

        if (!existingOrganization) {
          throw new Error("User does not have an organization");
        }

        const org = existingOrganization as {
          stripeSubscriptionId: string;
          stripeCustomerId: string;
        };

        await stripe.subscriptions.cancel(org.stripeSubscriptionId);
        await stripe.customers.del(org.stripeCustomerId);
        // TODO: Purge account
        break;
    }

    return new Response("Webhook received", { status: 200 });
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error verifying webhook", { status: 400 });
  }
}
