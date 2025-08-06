import { Metadata } from "next";
import SessionsClientPage from "./client-page";

export const metadata: Metadata = {
  title: "Sessions | vibe0",
  description: "Sessions list",
};

export default async function SessionsPage() {
  return <SessionsClientPage />;
}