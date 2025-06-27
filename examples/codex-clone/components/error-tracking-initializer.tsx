"use client";

import { useEffect } from "react";
import { initErrorTracking, setUserContext } from "@/lib/utils/error-tracking";
import { useGitHubAuth } from "@/hooks/use-github-auth";

export default function ErrorTrackingInitializer() {
  const { user } = useGitHubAuth();

  useEffect(() => {
    initErrorTracking().catch(console.error);
  }, []);

  useEffect(() => {
    if (user) {
      setUserContext({
        id: user.id.toString(),
        email: user.email || undefined,
        username: user.login,
      });
    }
  }, [user]);

  return null;
}