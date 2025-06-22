"use client";
import { useGitHubAuth } from "@/hooks/use-github-auth";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { EnhancedEnvironmentsList } from "./_components/enhanced-environments-list";
import { ActiveSandboxes } from "./_components/active-sandboxes";

export default function EnvironmentsClientPage() {
  const { isAuthenticated } = useGitHubAuth();

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <OnboardingFlow />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Environments</h2>
        <p className="text-muted-foreground">
          Manage your development environments and repositories.
        </p>
      </div>
      <div className="space-y-6">
        <ActiveSandboxes />
        <EnhancedEnvironmentsList />
      </div>
    </div>
  );
}
