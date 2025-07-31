import { siteConfig } from "@/config";

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

export class GitHubAuth {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.GITHUB_CLIENT_ID!;
    this.clientSecret = clientSecret || process.env.GITHUB_CLIENT_SECRET!;
    this.redirectUri = siteConfig.githubCallbackUrl;
  }

  // Generate GitHub OAuth URL
  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: "repo user:email",
      state: state || Math.random().toString(36).substring(7),
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  // Exchange code for access token
  async exchangeCodeForToken(code: string): Promise<string> {
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description}`);
    }

    return data.access_token;
  }

  // Get user information
  async getUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.statusText}`);
    }

    return response.json();
  }

  // Get user repositories
  async getUserRepositories(accessToken: string): Promise<GitHubRepository[]> {
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=100",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.statusText}`);
    }

    return response.json();
  }

  // Create a pull request
  async createPullRequest(
    accessToken: string,
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string = "main"
  ) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body,
          head,
          base,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create pull request: ${response.statusText}`);
    }

    return response.json();
  }
}

export const getGithubAuth = (clientId?: string, clientSecret?: string) =>
  new GitHubAuth(clientId, clientSecret);
