export const siteConfig = {
  appName: "VibeKit Onboard",
  baseUrl:
    process.env.NODE_ENV === "production"
      ? "https://app.vibekit.sh"
      : "http://localhost:3000",
  termsOfServiceUrl: "https://www.vibekit.sh/terms-of-service",
  privacyPolicyUrl: "https://www.vibekit.sh/privacy-policy",
  cookiePolicyUrl: "",
  supportUrl: "",
  copyrightText: "© 2025 Superagent Technologies Inc. All rights reserved.",
  githubCallbackUrl:
    process.env.NODE_ENV === "production"
      ? "https://app.vibekit.sh/api/github/auth/callback"
      : "http://localhost:3000/api/github/auth/callback",
  clerkOauthUrl:
    process.env.NODE_ENV === "production"
      ? "https://clerk.vibekit.sh/v1/oauth_callback"
      : "https://trusted-osprey-96.clerk.accounts.dev/v1/oauth_callback",
  mainNav: [
    {
      title: "Projects",
      href: "/",
      icon: "/projects.svg",
    },
    {
      title: "Logs",
      href: "/logs",
      icon: "/logs.svg",
    },
    // {
    //   title: "Users",
    //   href: "/users",
    //   icon: "/users.svg",
    // },
  ],
  defaultWidgetValues: {
    buttonText: "Add To My App",
    headlineText: "Add VibeKit to your app",
    descriptionText:
      "Receive a PR to your repository or copy the prompt to Cursor, Windsurf etc.",
  },
};
