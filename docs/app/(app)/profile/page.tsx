import { Metadata } from "next";
import ProfileClientPage from "./client-page";

export const metadata: Metadata = {
  title: "Profile | VibeKit Onboard",
  description: "Update your profile",
};

export default function ProfilePage() {
  return <ProfileClientPage />;
}
