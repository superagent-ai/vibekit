import { Metadata } from "next";
import ClientPage from "./client-page";

export const metadata: Metadata = {
  title: "Vibe0 | VibeKit",
  description: "A v0 clone built with VibeKit",
};

export default function Home() {
  return <ClientPage />;
}
