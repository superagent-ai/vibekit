"use server";
import { clerkClient } from "@/lib/clerk";

export async function addToWaitlistAction(email: string) {
  await clerkClient.waitlistEntries.create({
    emailAddress: email,
  });
}
