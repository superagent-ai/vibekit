import enquirer from "enquirer";
import chalk from "chalk";
import cfonts from "cfonts";
import { execa } from "execa";
import { installE2B } from "./providers/e2b.js";
import { installDaytona } from "./providers/daytona.js";
import { installNorthflank } from "./providers/northflank.js";
import { installLocal, isDaggerCliInstalled } from "./providers/dagger.js";
import { authenticate, checkAuth, isCliInstalled } from "../utils/auth.js";
import { AGENT_TEMPLATES, SANDBOX_PROVIDERS } from "@vibe-kit/sdk";

const { prompt } = enquirer;

// Add this type and registry after imports
type InstallConfig = {
  cpu: number;
  memory: number;
  disk: number; // Make required to match Daytona expectations
  projectId?: string; // For Northflank project ID
  workspaceId?: string; // For Daytona workspace naming
};

type ProviderInstaller = {
  isInstalled: () => Promise<boolean>;
  configTransform: (config: InstallConfig) => InstallConfig;
  install: (
    config: InstallConfig,
    templates: string[],
    uploadImages?: boolean
  ) => Promise<boolean>;
};

const installers: Record<SANDBOX_PROVIDERS, ProviderInstaller> = {
  [SANDBOX_PROVIDERS.E2B]: {
    isInstalled: async () => await isCliInstalled("e2b"),
    configTransform: (config) => config,
    install: (
      config: InstallConfig,
      templates: string[],
      uploadImages?: boolean
    ) => installE2B(config, templates),
  },
  [SANDBOX_PROVIDERS.DAYTONA]: {
    isInstalled: async () => await isCliInstalled("daytona"),
    configTransform: (config) => ({
      ...config,
      memory: Math.floor(config.memory / 1024),
    }),
    install: (
      config: InstallConfig,
      templates: string[],
      uploadImages?: boolean
    ) => installDaytona(config, templates),
  },
  [SANDBOX_PROVIDERS.NORTHFLANK]: {
    isInstalled: async () => await isCliInstalled("northflank"),
    configTransform: (config: InstallConfig) => config,
    install: (
      config: InstallConfig,
      templates: string[],
      uploadImages?: boolean
    ) => installNorthflank(config, templates),
  },
  [SANDBOX_PROVIDERS.DAGGER]: {
    isInstalled: async () => await isDaggerCliInstalled(),
    configTransform: (config: InstallConfig) => config,
    install: (
      config: InstallConfig,
      templates: string[],
      uploadImages?: boolean
    ) => installLocal(config, templates, uploadImages),
  },
  [SANDBOX_PROVIDERS.CLOUDFLARE]: {
    isInstalled: async () => true, // Cloudflare doesn't require CLI installation
    configTransform: (config: InstallConfig) => config,
    install: async (
      config: InstallConfig,
      templates: string[],
      uploadImages?: boolean
    ) => {
      console.log(chalk.yellow("Cloudflare provider setup is not yet implemented"));
      return true;
    },
  },
};

async function checkDockerStatus(): Promise<{
  isInstalled: boolean;
  isRunning: boolean;
}> {
  try {
    // Check if Docker is installed
    await execa("docker", ["--version"]);

    try {
      // Check if Docker daemon is running
      await execa("docker", ["info"]);
      return { isInstalled: true, isRunning: true };
    } catch {
      return { isInstalled: true, isRunning: false };
    }
  } catch {
    return { isInstalled: false, isRunning: false };
  }
}

export async function initCommand(
  options: {
    providers?: string;
    agents?: string;
    cpu?: string;
    memory?: string;
    disk?: string;
    projectId?: string;
    workspaceId?: string;
    uploadImages?: boolean;
  } = {}
) {
  try {
    // Display banner
    cfonts.say("VIBEKIT", {
      font: "block",
      align: "left",
      colors: ["#FFA500"],
      background: "transparent",
      letterSpacing: 1,
      lineHeight: 1,
      space: true,
      maxLength: "0",
      gradient: false,
      independentGradient: false,
      transitionGradient: false,
      env: "node",
    });

    // Show requirements
    console.log(chalk.blue("🖖 Welcome to VibeKit Setup! 🖖\n"));
    console.log(chalk.yellow("📋 Requirements:"));
    console.log(chalk.gray("  • Internet connection"));
    console.log(chalk.gray("  • Docker installed and running"));
    console.log(chalk.gray("  • Account on at least one sandbox provider\n"));

    // Parse CLI options
    let providers: SANDBOX_PROVIDERS[] = [];
    let templates: string[] = [];

    // Handle providers from CLI flag
    if (options.providers) {
      const providersInput = options.providers.split(",").map((p) => p.trim());
      const validProviders = Object.values(SANDBOX_PROVIDERS);

      // Create mapping for case-insensitive lookup
      const providerMapping: Record<string, SANDBOX_PROVIDERS> = {
        e2b: SANDBOX_PROVIDERS.E2B,
        daytona: SANDBOX_PROVIDERS.DAYTONA,
        northflank: SANDBOX_PROVIDERS.NORTHFLANK,
        dagger: SANDBOX_PROVIDERS.DAGGER,
      };

      for (const provider of providersInput) {
        const lowerProvider = provider.toLowerCase();
        const mappedProvider =
          providerMapping[lowerProvider] || (provider as SANDBOX_PROVIDERS);

        if (validProviders.includes(mappedProvider)) {
          providers.push(mappedProvider);
        } else {
          console.log(chalk.red(`❌ Invalid provider: ${provider}`));
          console.log(
            chalk.gray(
              `   Valid providers: ${Object.keys(providerMapping).join(
                ", "
              )} (case-insensitive)`
            )
          );
          process.exit(1);
        }
      }
    } else {
      // Prompt for provider selection
      console.log(
        chalk.gray("↑/↓: Navigate • Space: Select • Enter: Confirm\n")
      );

      const result = await prompt<{ providers: SANDBOX_PROVIDERS[] }>({
        type: "multiselect",
        name: "providers",
        message: "Which providers would you like to set up?",
        choices: Object.entries(SANDBOX_PROVIDERS).map(([key, value]) => ({
          name: value as string,
          message: value as string,
        })),
      });
      providers = result.providers;
    }

    if (providers.length === 0) {
      console.log(chalk.yellow("No providers selected. Exiting."));
      process.exit(0);
    }

    // Handle agents from CLI flag
    if (options.agents) {
      const agentsInput = options.agents.split(",").map((a) => a.trim());
      const validAgents = AGENT_TEMPLATES.map((t: any) => t.name);

      for (const agent of agentsInput) {
        const lowerAgent = agent.toLowerCase();
        const foundAgent = validAgents.find(
          (valid: any) => valid.toLowerCase() === lowerAgent
        );

        if (foundAgent) {
          templates.push(foundAgent);
        } else {
          console.log(chalk.red(`❌ Invalid agent: ${agent}`));
          console.log(
            chalk.gray(
              `   Valid agents: ${validAgents.join(", ")} (case-insensitive)`
            )
          );
          process.exit(1);
        }
      }
    } else {
      // Prompt for template selection
      const result = await prompt<{ templates: string[] }>({
        type: "multiselect",
        name: "templates",
        message: "Which agent templates would you like to install?",
        choices: AGENT_TEMPLATES.map((template: any) => ({
          name: template.name,
          message: template.display,
        })),
      });
      templates = result.templates;
    }

    if (templates.length === 0) {
      console.log(chalk.yellow("No templates selected"));
      return;
    }

    // Add this function before the prompts
    function getResourcePrompts(providers: SANDBOX_PROVIDERS[]) {
      const prompts = [
        {
          type: "input",
          name: "cpu",
          message: "CPU cores per provider (Recommended: 2-4 cores):",
          initial: "2",
          validate: (value: string) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0
              ? true
              : "Please enter a valid number";
          },
        },
        {
          type: "input",
          name: "memory",
          message: "Memory (MB) per provider (Recommended: 1024-4096 MB):",
          initial: "1024",
          validate: (value: string) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0
              ? true
              : "Please enter a valid number";
          },
        },
      ];

      if (providers.includes(SANDBOX_PROVIDERS.DAYTONA)) {
        prompts.push({
          type: "input",
          name: "disk",
          message: "Disk space (GB) for Daytona (Recommended: 1-3 GB):",
          initial: "1",
          validate: (value: string) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0
              ? true
              : "Please enter a valid number";
          },
        });
      }

      // Add more conditional prompts for other providers here in the future

      return prompts;
    }

    // Handle resource configuration from CLI flags or prompts
    let cpu: string, memory: string, disk: string;

    if (
      options.cpu &&
      options.memory &&
      (options.disk || !providers.includes(SANDBOX_PROVIDERS.DAYTONA))
    ) {
      // Use CLI flags when provided
      cpu = options.cpu;
      memory = options.memory;
      disk = options.disk || "1"; // Default for providers that don't need disk config

      console.log(chalk.gray("\nUsing provided resource configuration:"));
      console.log(chalk.gray(`  CPU cores: ${cpu}`));
      console.log(chalk.gray(`  Memory: ${memory} MB`));
      if (providers.includes(SANDBOX_PROVIDERS.DAYTONA)) {
        console.log(chalk.gray(`  Disk space: ${disk} GB`));
      }
    } else {
      // Use interactive prompts
      console.log(
        chalk.gray("\nConfigure resource allocation for your providers:")
      );
      const resourceResponses = await prompt<{
        cpu: string;
        memory: string;
        disk?: string;
      }>(getResourcePrompts(providers));
      cpu = resourceResponses.cpu;
      memory = resourceResponses.memory;
      disk = resourceResponses.disk ?? "1";
    }

    // Validate CLI flag values
    const cpuNum = parseInt(cpu);
    const memoryNum = parseInt(memory);
    const diskNum = parseInt(disk);

    if (isNaN(cpuNum) || cpuNum <= 0) {
      console.log(
        chalk.red(`❌ Invalid CPU value: ${cpu}. Must be a positive number.`)
      );
      process.exit(1);
    }
    if (isNaN(memoryNum) || memoryNum <= 0) {
      console.log(
        chalk.red(
          `❌ Invalid memory value: ${memory}. Must be a positive number.`
        )
      );
      process.exit(1);
    }
    if (isNaN(diskNum) || diskNum <= 0) {
      console.log(
        chalk.red(`❌ Invalid disk value: ${disk}. Must be a positive number.`)
      );
      process.exit(1);
    }

    // Handle project ID and workspace ID from CLI flags or environment variables
    let projectId = options.projectId || process.env.NORTHFLANK_PROJECT_ID;
    let workspaceId = options.workspaceId || process.env.DAYTONA_WORKSPACE_ID;

    // Validate required IDs for specific providers
    if (providers.includes(SANDBOX_PROVIDERS.NORTHFLANK) && !projectId) {
      console.log(chalk.red(`❌ Northflank requires a project ID.`));
      console.log(chalk.yellow(`💡 Solutions:`));
      console.log(
        chalk.yellow(
          `   1. Use --project-id flag: vibekit init --project-id your-project-id`
        )
      );
      console.log(
        chalk.yellow(
          `   2. Set environment variable: export NORTHFLANK_PROJECT_ID=your-project-id`
        )
      );
      console.log(
        chalk.gray(`📖 Learn more: https://northflank.com/docs/v1/api/projects`)
      );
      process.exit(1);
    }

    if (projectId) {
      console.log(chalk.gray(`🔧 Using Northflank project ID: ${projectId}`));
    }
    if (workspaceId) {
      console.log(chalk.gray(`🔧 Using Daytona workspace ID: ${workspaceId}`));
    }

    const config = {
      cpu: cpuNum,
      memory: memoryNum,
      disk: diskNum,
      projectId,
      workspaceId,
    };

    // Check Docker once upfront since all providers need it
    console.log(chalk.blue("\n🐳 Checking Docker..."));
    const dockerStatus = await checkDockerStatus();
    if (!dockerStatus.isInstalled) {
      console.log(
        chalk.red(
          "❌ Docker not found. Please install Docker from: https://docker.com/get-started and try again. Setup failed: Docker is required for all providers"
        )
      );
      return;
    }

    if (!dockerStatus.isRunning) {
      console.log(
        chalk.red(
          "❌ Docker is not running. Please start Docker and try again. Setup failed: Docker must be running to deploy templates"
        )
      );
      return;
    }

    console.log(chalk.green("✅ Docker is installed and running"));

    // Install selected providers
    let successfulProviders = 0;
    let failedProviders = 0;

    for (const provider of providers) {
      let isAuthenticated = false;

      // Use registry for provider-specific handlers
      const installer = installers[provider];

      // Special handling for Local provider (no authentication needed)
      if (provider === SANDBOX_PROVIDERS.DAGGER) {
        console.log(chalk.blue(`\n🏠 Setting up ${provider} provider...`));

        // Proceed directly to installation for local provider
        const transformedConfig = installer.configTransform(config);
        const installationSuccess = await installer.install(
          transformedConfig,
          templates,
          options.uploadImages
        );

        if (installationSuccess) {
          successfulProviders++;
        } else {
          failedProviders++;
        }
        continue; // Skip to next provider
      }

      // Check if we need to install the CLI first
      const needsInstall = !(await installer.isInstalled());
      if (needsInstall) {
        console.log(chalk.yellow(`\n🔧 ${provider} CLI needs to be installed`));
        const installed = await authenticate(provider);
        if (!installed) {
          console.log(
            chalk.yellow(`\nPlease install ${provider} CLI and try again.`)
          );
          failedProviders++;
          continue; // Skip to next provider
        }
      }

      // Now check authentication
      console.log(chalk.blue(`\n🔐 Checking ${provider} authentication...`));
      const authStatus = await checkAuth(provider);

      if (!authStatus.isAuthenticated) {
        console.log(chalk.yellow(`🔑 Authentication required for ${provider}`));
        const success = await authenticate(provider);
        if (!success) {
          console.log(
            chalk.yellow(
              `\nPlease authenticate with ${provider} and try again.`
            )
          );
          failedProviders++;
          continue; // Skip to next provider
        }

        // Verify authentication after login attempt
        const newAuthStatus = await checkAuth(provider);
        if (!newAuthStatus.isAuthenticated) {
          console.log(chalk.red(`❌ Failed to authenticate with ${provider}`));
          failedProviders++;
          continue; // Skip to next provider
        }
        isAuthenticated = true;
      } else {
        console.log(chalk.green(`✅ Already authenticated with ${provider}`));
        isAuthenticated = true;
      }

      if (!isAuthenticated) {
        failedProviders++;
        continue; // Skip to next provider if not authenticated
      }

      // Proceed with installation (Docker already verified)
      const transformedConfig = installer.configTransform(config);
      const installationSuccess = await installer.install(
        transformedConfig,
        templates,
        options.uploadImages
      );

      if (installationSuccess) {
        successfulProviders++;
      } else {
        failedProviders++;
      }
    }

    // Show final result based on success/failure
    if (successfulProviders > 0 && failedProviders === 0) {
      console.log(chalk.green("\n✅ Setup complete!\n"));
    } else if (successfulProviders > 0 && failedProviders > 0) {
      console.log(
        chalk.yellow(
          `\n⚠️  Setup partially complete: ${successfulProviders} succeeded, ${failedProviders} failed\n`
        )
      );
    } else {
      console.log(
        chalk.red(
          "\n❌ Setup failed: No providers were successfully configured\n"
        )
      );
    }
  } catch (error) {
    console.error(
      chalk.red("\n❌ Setup failed:"),
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}
