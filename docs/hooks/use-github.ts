import { useState, useEffect } from "react";
import { siteConfig } from "@/config";

export type Agent = {
  _id: string;
  name: string;
  descriptionText: string;
  headlineText: string;
  buttonText: string;
  logo: string;
  showButtonLogo: boolean;
  systemPrompt: string;
  primaryColor: string;
  projectId: string;
};

export type Project = {
  _id: string;
  logo: string;
  name: string;
  primaryColor: string;
  githubClientId: string;
  githubClientSecret: string;
};

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description?: string;
  html_url: string;
  default_branch: string;
  fork: boolean;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  name?: string;
  email?: string;
}

export interface GitHubAuth {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  repositories: GitHubRepository[];
  isLoading: boolean;
  isFetchingRepositories: boolean;
  token: string | null;
  error: string | null;
  login: (agentId: string) => Promise<void>;
  logout: () => void;
  fetchRepositories: (agentId: string) => Promise<void>;
}

export function useGitHubAuth(agentId: string): GitHubAuth {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingRepositories, setIsFetchingRepositories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "GITHUB_AUTH_SUCCESS") {
        // Wait a bit for cookies to be set, then check auth status
        setTimeout(async () => {
          // Instead of reloading the page, just check auth status again
          const userCookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith("github_user="));

          const userTokenCookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith("github_access_token="));

          if (userCookie && userTokenCookie) {
            try {
              const userData = JSON.parse(
                decodeURIComponent(userCookie.split("=")[1])
              );
              const userToken = decodeURIComponent(
                userTokenCookie.split("=")[1]
              );

              setUser(userData);
              setIsAuthenticated(true);
              setToken(userToken);
              await fetchRepositories(agentId);
              setIsLoading(false);
            } catch (error) {
              console.error("Error parsing user data:", error);
              setIsAuthenticated(false);
              setUser(null);
              setIsLoading(false);
            }
          }
        }, 1000);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const login = async (agentId: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // Get the auth URL from our API with prompt=consent to always show grant page
      const response = await fetch(
        `${siteConfig.baseUrl}/api/github/auth/url?agentId=${agentId}`
      );
      const { url } = await response.json();

      // Open popup window for OAuth - centered on screen
      const width = 600;
      const height = 700;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      const popup = window.open(
        url,
        "github-oauth",
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );

      // Check if popup was blocked
      if (!popup) {
        throw new Error("Popup blocked. Please allow popups for this site.");
      }

      // Wait for popup to close
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setIsLoading(false);
        }
      }, 1000);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Authentication failed"
      );
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    // Clear cookies
    document.cookie =
      "github_access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie =
      "github_user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

    setIsAuthenticated(false);
    setUser(null);
    setRepositories([]);
  };

  const fetchRepositories = async (agentId: string): Promise<void> => {
    try {
      setIsFetchingRepositories(true);
      setError(null);

      const response = await fetch(
        `${siteConfig.baseUrl}/api/github/repositories?token=${token}&agentId=${agentId}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch repositories");
      }

      const data = await response.json();
      setRepositories(data.repositories || []);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to fetch repositories"
      );
    } finally {
      setIsFetchingRepositories(false);
    }
  };

  return {
    isAuthenticated,
    user,
    repositories,
    isLoading,
    isFetchingRepositories,
    error,
    token,
    login,
    logout,
    fetchRepositories,
  };
}
