import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { stripe } from "@/lib/stripe";
import BillingClientPage from "./client-page";

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export const metadata: Metadata = {
  title: "Billing | VibeKit Onboard",
  description: "Update your billing settings",
};

export default async function BillingPage({ searchParams }: Props) {
  const { userId } = await auth();
  const { page: _page } = await searchParams;
  const page = parseInt(_page || "1");
  const limit = 10; // Invoices per page
  const organization = await fetchQuery(
    api.organizations.getOrganizationByUserId,
    {
      userId: userId!,
    }
  );

  if (!organization) return notFound();

  const subscription = await stripe.subscriptions.retrieve(
    organization.stripeSubscriptionId!
  );
  const product = await stripe.products.retrieve(
    subscription.items.data[0].price.product as string
  );

  // For proper pagination, we need to fetch more invoices to determine if there are more pages
  const invoicesResponse = await stripe.invoices.list({
    customer: organization.stripeCustomerId!,
    limit: limit + 1, // Fetch one extra to check if there are more
  });

  // Calculate pagination
  const hasMore = invoicesResponse.data.length > limit;
  const invoices = {
    data: invoicesResponse.data.slice(0, limit), // Remove the extra invoice
    has_more: hasMore,
  };
  const currentPage = page;

  const session = await stripe.billingPortal.sessions.create({
    customer: organization.stripeCustomerId!,
  });

  return (
    <BillingClientPage
      portalUrl={session.url!}
      productName={product.name!}
      invoices={invoices.data}
      pagination={{
        currentPage,
        hasMore,
        limit,
      }}
    />
  );
}
