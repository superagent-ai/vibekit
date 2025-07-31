import { auth } from "@clerk/nextjs/server";
import ClientPage from "./client-page";
import { notFound } from "next/navigation";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    return notFound();
  }
  return <ClientPage userId={userId} />;
}
