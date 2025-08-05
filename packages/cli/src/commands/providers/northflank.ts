import { execa } from "execa";
import ora from "ora";
import chalk from "chalk";
import path from "path";
import { AGENT_TEMPLATES } from "@vibe-kit/sdk";

import { isCliInstalled } from "../../utils/auth.js";

import { installTemplates, InstallConfig } from "../../utils/install.js";

export async function installNorthflank(
  config: InstallConfig,
  selectedTemplates?: string[]
) {
  // Create/ensure templates exist for reusable coding environments
  await ensureVibeKitTemplates(config, selectedTemplates || []);
  console.log(`✅ Templates created successfully!`);
  console.log(
    `💡 To run a coding environment, use: northflank run template --template <agent-name>`
  );
  console.log(`📝 Available templates: ${selectedTemplates?.join(", ")}`);

  // Return success without running the templates - just create them
  return true;
}

async function ensureVibeKitTemplates(
  config: InstallConfig,
  selectedTemplates: string[]
): Promise<void> {
  for (const template of selectedTemplates) {
    await createAgentTemplate(template, config);
  }
}

async function createAgentTemplate(
  agentName: string,
  config: InstallConfig
): Promise<void> {
  const templateName = agentName;

  // Check if template already exists
  try {
    console.log(`🔍 Checking if template ${templateName} exists...`);
    const { execa } = await import("execa");
    await execa("northflank", ["get", "template", "--template", templateName]);
    console.log(`✅ Template ${templateName} already exists`);
    return;
  } catch (error) {
    console.log(`📝 Creating new template: ${templateName}`);
  }

  const templateSpec = {
    apiVersion: "v1.2",
    name: templateName,
    description: `${
      agentName.charAt(0).toUpperCase() + agentName.slice(1)
    } Agent Coding Sandbox`,
    arguments: {
      serviceName: {
        type: "string",
        description: "Unique name for the service instance",
      },
      deploymentPlan: {
        type: "string",
        description: "Northflank deployment plan",
        default: "nf-compute-20",
      },
      buildPlan: {
        type: "string",
        description: "Northflank build plan",
        default: "nf-compute-400-16",
      },
    },
    argumentOverrides: {},
    options: {
      autorun: false,
      concurrencyPolicy: "queue",
    },
    spec: {
      kind: "Workflow",
      spec: {
        type: "sequential",
        context: {
          projectId: config.projectId || "vibekit",
        },
        steps: [
          {
            kind: "CombinedService",
            ref: `${agentName}-service`,
            spec: {
              name: "${args.serviceName}",
              deployment: {
                instances: 1,
                storage: {
                  ephemeralStorage: {
                    storageSize: 1024,
                  },
                  shmSize: 64,
                },
                docker: {
                  configType: "default",
                },
              },
              runtimeEnvironment: {},
              runtimeFiles: {},
              buildArguments: {},
              buildFiles: {},
              billing: {
                deploymentPlan: "${args.deploymentPlan}",
                buildPlan: "${args.buildPlan}",
              },
              vcsData: {
                projectType: "github",
                projectUrl: "https://github.com/superagent-ai/vibekit",
                projectBranch: "main",
              },
              ports: [
                {
                  internalPort: 3000,
                  protocol: "HTTP",
                  name: "p01",
                  public: true,
                  domains: [],
                  security: {
                    policies: [],
                    credentials: [],
                  },
                  disableNfDomain: false,
                },
              ],
              buildSettings: {
                dockerfile: {
                  buildEngine: "kaniko",
                  useCache: false,
                  dockerWorkDir: "/",
                  dockerFilePath: `/assets/dockerfiles/Dockerfile.${agentName}`,
                  buildkit: {
                    useInternalCache: false,
                    internalCacheStorage: 16384,
                  },
                },
              },
            },
          },
        ],
      },
    },
  };

  try {
    const { execa } = await import("execa");
    await execa("northflank", [
      "create",
      "template",
      "--input",
      JSON.stringify(templateSpec),
    ]);

    console.log(
      `✅ Template ${templateName} created successfully - can now be re-run multiple times`
    );
  } catch (error: any) {
    if (error.message?.includes("permission")) {
      console.error(
        `❌ Template creation failed: Missing required permissions`
      );
      console.error(
        `🔑 Required: 'Account > Templates > General > Create' permission in Northflank`
      );
      console.error(
        `💡 Solution: Update your Northflank API token with template permissions`
      );
      console.error(
        `📖 See: https://northflank.com/docs/v1/api/authentication`
      );
      throw new Error(
        `Northflank templates require elevated API permissions. Please update your API token to include 'Account > Templates > General > Create' permission.`
      );
    } else {
      console.error(`❌ Template creation failed: ${error.message}`);
      throw error;
    }
  }
}

function mapCpuToNorthflankPlan(cpu: number, memory: number): string {
  // Map CPU/memory to Northflank deployment plans based on actual available plans
  // Default to free tier compatible plans to avoid billing errors

  // For free tier users, always use the smallest available plan to avoid overage
  // Users can upgrade their account if they need more resources
  console.log(
    `🔧 Northflank: Mapping ${cpu} CPU cores and ${memory}MB memory to deployment plan...`
  );

  // Always default to smallest plan for free tier compatibility
  const plan = "nf-compute-20"; // 0.2 vCPU, 512MB RAM - smallest available
  console.log(`🔧 Northflank: Selected plan ${plan} (0.2 vCPU, 512MB RAM)`);
  console.log(
    `💡 Note: Using minimal plan for free tier compatibility. Upgrade your Northflank account for larger plans.`
  );

  return plan;
}
