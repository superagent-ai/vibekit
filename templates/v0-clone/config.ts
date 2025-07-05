export interface Template {
  id: string;
  name: string;
  description: string;
  repository: string;
  logos: string[];
  image?: string;
  startCommands: {
    command: string;
    status: "INSTALLING_DEPENDENCIES" | "STARTING_DEV_SERVER" | "CUSTOM";
    statusMessage?: string;
    background?: boolean;
  }[];
  secrets?: Record<string, string>;
  systemPrompt: string;
}

export const templates: Template[] = [
  {
    id: "nextjs",
    name: "Next.js",
    description:
      "Build scalable web applications with server-side rendering, static site generation, and API routes",
    repository: "https://github.com/superagent-ai/vibekit-nextjs",
    logos: ["nextjs.svg"],
    startCommands: [
      {
        command: "npm i",
        status: "INSTALLING_DEPENDENCIES",
      },
      {
        command: "npm run dev",
        status: "STARTING_DEV_SERVER",
        background: true,
      },
    ],
    systemPrompt:
      "# GOAL\nYou are an helpful assistant that is tasked with helping the user build a NextJS app.\n" +
      "- The NextJS dev server is running on port 3000.\n" +
      "- ShadCN UI is installed, togehter with all the ShadCN components.\n",
  },
  {
    id: "nextjs-supabase-auth",
    name: "Next.js + Supabase + Auth",
    description:
      "Build a production-ready SaaS with authentication, database, and real-time features out of the box",
    repository: "https://github.com/superagent-ai/vibekit-nextjs-supabase",
    logos: ["nextjs.svg", "supabase.jpeg"],
    startCommands: [
      {
        command: "npm i && npm i supabase --save-dev",
        status: "INSTALLING_DEPENDENCIES",
      },
      {
        // Step 1: Generate a project name
        command: `export PROJECT_NAME=vibe0-$(date +%F)-$RANDOM`,
        status: "CUSTOM",
        statusMessage: "GENERATING PROJECT NAME",
      },
      {
        // Step 2: Create the project
        command: `npx supabase projects create $PROJECT_NAME --db-password $(openssl rand -base64 32) --org-id bdnfcdckdiuoxnvimgkz`,
        status: "CUSTOM",
        statusMessage: "CREATING SUPABASE PROJECT",
      },
      {
        // Step 3: Retrieve the project ref
        command: `export PROJECT_REF=$(npx supabase projects list | grep $PROJECT_NAME | awk '{print $1}')`,
        status: "CUSTOM",
        statusMessage: "FETCHING PROJECT REF",
      },
      {
        // Step 4: Get anon key
        command: `export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(supabase projects api-keys --project-ref $PROJECT_REF | grep anon | awk '{print $2}')`,
        status: "CUSTOM",
        statusMessage: "FETCHING ANON KEY",
      },
      {
        // Step 5: List env vars instead of saving to .env
        command: `echo "NEXT_PUBLIC_SUPABASE_URL=https://$PROJECT_REF.supabase.co" && echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY"`,
        status: "CUSTOM",
        statusMessage: "DISPLAYING ENV VARS",
      },
      {
        command: "npm run dev",
        status: "STARTING_DEV_SERVER",
        background: true,
      },
    ],
    systemPrompt:
      "# GOAL\nYou are an helpful assistant that is tasked with helping the user build a NextJS app.\n" +
      "- The NextJS dev server is running on port 3000.\n" +
      "- ShadCN UI is installed, togehter with all the ShadCN components.\n" +
      "- Supabase CLI and Auth is installed and ready to be used if needed.\n",
  },
  {
    id: "nextjs-convex-clerk",
    name: "Next.js + Convex + Clerk",
    description:
      "Create collaborative apps with real-time sync, instant auth, and seamless user management",
    repository: "https://github.com/get-convex/convex-clerk-users-table",
    logos: ["nextjs.svg", "convex.webp", "clerk.svg"],
    startCommands: [
      {
        command: "npm i",
        status: "INSTALLING_DEPENDENCIES",
      },
      {
        command: "npm run dev",
        status: "STARTING_DEV_SERVER",
        background: true,
      },
      {
        command: "npx convex dev",
        status: "STARTING_DEV_SERVER",
        background: true,
      },
    ],
    systemPrompt:
      "# GOAL\nYou are an helpful assistant that is tasked with helping the user build a NextJS app.\n" +
      "- The NextJS dev server is running on port 3000.\n" +
      "- The convex command npx convex dev is running\n" +
      "- ShadCN UI is installed, togehter with all the ShadCN components.\n" +
      "- Convex CLI is is installed and ready to be used if needed.\n",
  },
  {
    id: "shopify-hydrogen",
    name: "Shopify",
    description:
      "Build fast headless commerce storefronts with Shopify's official framework Hydrogen.",
    repository: "superagent-ai/vibekit-shopify",
    logos: ["shopify.jpeg"],
    startCommands: [
      {
        command: "npm i",
        status: "INSTALLING_DEPENDENCIES",
      },
      {
        command: "npm i -g @shopify/cli@latest",
        status: "INSTALLING_DEPENDENCIES",
      },
      {
        command: "echo 'SESSION_SECRET=\"foobar\"' > .env",
        status: "INSTALLING_DEPENDENCIES",
      },
      {
        command: "shopify hydrogen dev --codegen --host",
        background: true,
        status: "STARTING_DEV_SERVER",
      },
    ],
    secrets: {
      SESSION_SECRET: "foobar",
    },
    systemPrompt:
      "# GOAL\nYou are an helpful assistant that is tasked with helping the user build a Shopify Hydrogen app.\n" +
      "- The hydrogen server is running on port 3000.\n" +
      "- The Shopify CLI is installed and ready to be used if needed.\n",
  },
  {
    id: "fastapi-nextjs",
    name: "FastAPI + Next.js",
    description:
      "Build modern full-stack apps with FastAPI backend and Next.js frontend.",
    repository: "tiangolo/full-stack-fastapi-template",
    logos: ["nextjs.svg", "fastapi.jpg"],
    startCommands: [
      {
        command: "npm i",
        status: "INSTALLING_DEPENDENCIES",
      },
      {
        command: "npm run dev",
        status: "STARTING_DEV_SERVER",
        background: true,
      },
    ],
    systemPrompt:
      "# GOAL\nYou are an helpful assistant that is tasked with helping the user build a FastAPI and Next.js app.\n" +
      "- The NextJS dev server is running on port 3000.\n" +
      "- The FastAPI server is running on port 8000.\n" +
      "- ShadCN UI is installed, togehter with all the ShadCN components.\n",
  },
];
