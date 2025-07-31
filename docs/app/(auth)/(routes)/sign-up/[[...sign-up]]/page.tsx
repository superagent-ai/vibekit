import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import ClientPage from "./client-page";

export const metadata: Metadata = {
  title: "Sign Up | VibeKit Onboard",
  description: "Sign up to your account",
};

export default async function SignUpPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/");
  }

  return <ClientPage />;
}
