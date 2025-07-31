import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import ClientPage from "./client-page";

export const metadata: Metadata = {
  title: "Log in | VibeKit Onboard",
  description: "Log in to your account",
};

export default async function SignInPage() {
  const { userId } = await auth();

  console.log("userId", userId);
  return <ClientPage />;
}
