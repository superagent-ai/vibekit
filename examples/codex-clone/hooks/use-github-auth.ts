"use client";

import { useState, useEffect } from "react";
import { GitHubRepository, GitHubUser, GitHubBranch } from "@/lib/github";

interface UseGitHubAuthReturn {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  repositories: GitHubRepository[];
  branches: GitHubBranch[];
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
  fetchRepositories: () => Promise<void>;
  fetchBranches: (repositoryName: string) => Promise<void>;
}

export function useGitHubAuth(): UseGitHubAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    const abortController = new AbortController();
    
    const checkAuth = async () => {
      try {
        setIsLoading(true);
        const userCookie = document.cookie
          .split("; ")
          .find((row) => row.startsWith("github_user="));

        if (userCookie) {
          const userData = JSON.parse(
            decodeURIComponent(userCookie.split("=")[1])
          );

          // Verify the access token is still valid by making a test API call
          const response = await fetch("/api/auth/github/repositories", {
            signal: abortController.signal,
          });

          if (response.ok) {
            setUser(userData);
            setIsAuthenticated(true);
          } else {
            // Token is invalid, clear cookies and auth state
            document.cookie =
              "github_access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            document.cookie =
              "github_user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            setIsAuthenticated(false);
            setUser(null);
          }
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('Component unmounted'))) {
          // Ignore abort errors
          return;
        }
        console.error("Error checking auth status:", error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    checkAuth();
    
    return () => {
      abortController.abort("Component unmounted");
    };
  }, []);

  // Listen for auth success from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "GITHUB_AUTH_SUCCESS") {
        // Wait a bit for cookies to be set, then check auth status
        setTimeout(() => {
          // Instead of reloading the page, just check auth status again
          const userCookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith("github_user="));

          if (userCookie) {
            try {
              const userData = JSON.parse(
                decodeURIComponent(userCookie.split("=")[1])
              );
              setUser(userData);
              setIsAuthenticated(true);
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

  const login = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // Get the auth URL from our API
      const response = await fetch("/api/auth/github/url");
      const { url } = await response.json();

      // Open popup window for OAuth (centered on screen)
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
    setBranches([]);
  };

  const fetchRepositories = async (): Promise<void> => {
    if (!isAuthenticated) return;
    console.log("isAuthenticated", isAuthenticated);
    
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/auth/github/repositories");

      if (!response.ok) {
        throw new Error("Failed to fetch repositories");
      }

      const data = await response.json();
      setRepositories(data.repositories || []);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Ignore abort errors
        return;
      }
      setError(
        error instanceof Error ? error.message : "Failed to fetch repositories"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBranches = async (repositoryName: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // Parse repository name to extract owner and repo
      // Repository name should be in format "owner/repo"
      const [owner, repo] = repositoryName.split("/");

      if (!owner || !repo) {
        throw new Error('Repository name must be in format "owner/repo"');
      }

      const response = await fetch(
        `/api/auth/github/branches?owner=${encodeURIComponent(
          owner
        )}&repo=${encodeURIComponent(repo)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch branches");
      }

      const data = await response.json();
      setBranches(data.branches || []);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to fetch branches"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isAuthenticated,
    user,
    repositories,
    branches,
    isLoading,
    error,
    login,
    logout,
    fetchRepositories,
    fetchBranches,
  };
}
