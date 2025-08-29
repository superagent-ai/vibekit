"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DefaultRedirect() {
  const router = useRouter();

  useEffect(() => {
    async function redirectToDefaultPage() {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const settings = await response.json();
          const defaultPage = settings.dashboard?.defaultPage || 'analytics';
          
          // Map setting values to actual routes
          const routeMap: Record<string, string> = {
            'analytics': '/',
            'projects-cards': '/projects',
            'projects-table': '/projects?view=table',
            'chat': '/chat',
            'monitoring': '/monitoring'
          };
          
          const targetRoute = routeMap[defaultPage] || '/';
          
          // Only redirect if we're not already on the target page
          if (targetRoute !== '/' || defaultPage !== 'analytics') {
            router.replace(targetRoute);
          }
        }
      } catch (error) {
        console.error("Failed to load default page setting:", error);
      }
    }

    redirectToDefaultPage();
  }, [router]);

  return null;
}