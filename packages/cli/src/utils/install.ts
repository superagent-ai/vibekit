import { execa } from "execa";
import ora from "ora";
import chalk from "chalk";
import { AGENT_TEMPLATES } from "@vibe-kit/sdk";

export type InstallConfig = {
  cpu: number;
  memory: number;
  disk: number;
  projectId?: string; // For Northflank project ID
  workspaceId?: string; // For Daytona workspace naming
};

export async function installTemplates(options: {
  provider: string;
  cliCommand: string;
  isInstalled: () => Promise<boolean>;
  buildArgs: (
    template: string,
    config: InstallConfig,
    tempDockerfile: string
  ) => string[];
  needsTempFile: boolean;
  dockerfilePathPrefix: string;
  config: InstallConfig;
  selectedTemplates?: string[];
}): Promise<boolean> {
  console.log(chalk.blue(`\n🔧 Setting up ${options.provider}...`));
  let spinner: ReturnType<typeof ora> | null = null;

  // Import path utilities at the top
  const path = await import("path");
  const fs = await import("fs/promises");

  // Find the project root by looking for package.json with workspaces OR assets/dockerfiles
  let projectRoot = process.cwd();

  // Start from current working directory and search up
  let currentDir = process.cwd();
  while (currentDir !== path.parse(currentDir).root) {
    try {
      // Look for assets/dockerfiles directory (most reliable indicator)
      const dockerfilesPath = path.join(currentDir, "assets", "dockerfiles");
      await fs.access(dockerfilesPath);
      projectRoot = currentDir;
      break;
    } catch (error) {
      // Also try looking for package.json with workspaces as fallback
      try {
        const packageJsonPath = path.join(currentDir, "package.json");
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, "utf8")
        );
        if (packageJson.workspaces) {
          projectRoot = currentDir;
          break;
        }
      } catch (error2) {
        // Continue searching up
      }
    }
    currentDir = path.dirname(currentDir);
  }

  try {
    const isInstalled = await options.isInstalled();

    if (!isInstalled) {
      console.log(
        chalk.yellow(
          `❌ ${options.provider} CLI not found.\n` +
            `Please install it and try again.`
        )
      );
      return false;
    }

    const results = { successful: 0, failed: 0, errors: [] as string[] };

    // Filter templates based on selection (default to all if none specified)
    const templatesToInstall =
      options.selectedTemplates && options.selectedTemplates.length > 0
        ? AGENT_TEMPLATES.filter((template: any) =>
            options.selectedTemplates!.includes(template.name)
          )
        : AGENT_TEMPLATES;

    // Install each selected template
    for (let i = 0; i < templatesToInstall.length; i++) {
      const template = templatesToInstall[i];
      console.log(
        chalk.blue(
          `\n🔨 [${i + 1}/${templatesToInstall.length}] Installing ${
            template.display
          } template...`
        )
      );

      spinner = ora({
        text: "  Working...",
        color: "blue",
        spinner: "dots",
        indent: 2,
      }).start();

      let tempDockerfile = "";
      let tempFileCreated = false;

      try {
        // Check if Dockerfile exists
        const dockerfilePath = path.join(
          projectRoot,
          options.dockerfilePathPrefix,
          `Dockerfile.${template.name}`
        );
        try {
          await fs.access(dockerfilePath);
        } catch (error) {
          // Add more debugging info
          const cwd = process.cwd();
          const relativePath = `${options.dockerfilePathPrefix}${template.name}`;
          console.error(chalk.gray(`   Debug: CWD: ${cwd}`));
          console.error(chalk.gray(`   Debug: Project root: ${projectRoot}`));
          console.error(chalk.gray(`   Debug: Looking for: ${dockerfilePath}`));
          console.error(chalk.gray(`   Debug: Relative path: ${relativePath}`));
          throw new Error(`Dockerfile not found at: ${dockerfilePath}`);
        }

        if (options.needsTempFile) {
          tempDockerfile = path.join(
            process.cwd(),
            `Dockerfile.${template.name}.tmp`
          );
          await fs.copyFile(dockerfilePath, tempDockerfile);
          tempFileCreated = true;
        } else {
          tempDockerfile = dockerfilePath;
        }

        // Run setup with provided configuration
        await execa(
          options.cliCommand,
          options.buildArgs(template.name, options.config, tempDockerfile)
        );

        spinner.succeed(
          chalk.green(`✅ ${template.display} template installed successfully`)
        );
        results.successful++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        let friendlyMessage = `Failed to install ${template.display} template`;

        if (
          errorMessage.includes("already exists") ||
          errorMessage.includes("already used")
        ) {
          friendlyMessage = `${template.display} template already exists - skipping`;
          spinner.info(chalk.yellow(`⚠️  ${friendlyMessage}`));
        } else if (errorMessage.includes("Dockerfile not found")) {
          friendlyMessage = `${template.display} template files missing - skipping`;
          spinner.fail(chalk.red(`❌ ${friendlyMessage}`));
          results.errors.push(`${template.display}: Template files not found`);
          results.failed++;
        } else {
          spinner.fail(chalk.red(`❌ ${friendlyMessage}`));
          results.errors.push(`${template.display}: ${errorMessage}`);
          results.failed++;
        }

        console.log(chalk.gray("   Continuing with next template..."));
      } finally {
        spinner = null;
        if (tempFileCreated) {
          try {
            await fs.unlink(tempDockerfile);
          } catch (cleanupError) {
            // Ignore
          }
        }
      }
    }

    // Print summary
    console.log(chalk.blue("\n📊 Installation Summary:"));
    console.log(
      chalk.green(`✅ Successfully installed: ${results.successful} templates`)
    );

    if (results.failed > 0) {
      console.log(
        chalk.red(`❌ Failed to install: ${results.failed} templates`)
      );
      if (results.errors.length > 0) {
        console.log(chalk.gray("\nError details:"));
        results.errors.forEach((error) => {
          console.log(chalk.gray(`  • ${error}`));
        });
      }
    }

    if (results.successful > 0) {
      return true;
    } else {
      console.log(
        chalk.yellow("\n⚠️  No templates were successfully installed.")
      );
      return false;
    }
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to set up ${options.provider}:`,
        error instanceof Error ? error.message : "Unknown error"
      )
    );
    return false;
  }
}
