import chalk from "chalk";
import enquirer from "enquirer";
import ora from "ora";
import { execa } from "execa";
import { checkAuth, installProviderCli } from "../../utils/auth.js";
import { SANDBOX_PROVIDERS } from "@vibe-kit/sdk";

export interface CloudflareConfig {
  provider: typeof SANDBOX_PROVIDERS.CLOUDFLARE;
  projectName?: string;
  templates: string[];
}

export async function installCloudflare(
  config: any,
  templates: string[]
): Promise<CloudflareConfig> {
  console.log(chalk.blue("\n🌩️  Setting up Cloudflare provider...\n"));

  // Check if wrangler CLI is installed
  let isInstalled = false;
  try {
    await execa("wrangler", ["--version"]);
    isInstalled = true;
  } catch {
    console.log(chalk.yellow("⚠️  Cloudflare wrangler CLI not found."));
    
    const { shouldInstall } = await enquirer.prompt<{
      shouldInstall: boolean;
    }>({
      type: "confirm",
      name: "shouldInstall",
      message: "Would you like to install wrangler CLI now?",
      initial: true,
    });

    if (shouldInstall) {
      isInstalled = await installProviderCli(SANDBOX_PROVIDERS.CLOUDFLARE);
    }
  }

  if (!isInstalled) {
    console.log(chalk.red("❌ Cloudflare setup cancelled."));
    console.log(
      chalk.yellow(
        "💡 Install wrangler manually: npm install -g wrangler"
      )
    );
    process.exit(1);
  }

  // Check authentication
  const authStatus = await checkAuth(SANDBOX_PROVIDERS.CLOUDFLARE);
  if (!authStatus.isAuthenticated) {
    console.log(chalk.yellow("\n⚠️  Not logged in to Cloudflare."));
    console.log(chalk.gray("This will open your browser to log in."));
    
    const { shouldAuth } = await enquirer.prompt<{
      shouldAuth: boolean;
    }>({
      type: "confirm",
      name: "shouldAuth",
      message: "Would you like to log in to Cloudflare now?",
      initial: true,
    });

    if (shouldAuth) {
      const spinner = ora("Opening browser for Cloudflare login...").start();
      try {
        await execa("wrangler", ["login"]);
        spinner.succeed("Cloudflare login successful!");
      } catch (error) {
        spinner.fail("Cloudflare login failed");
        console.log(chalk.red("❌ Failed to authenticate with Cloudflare."));
        console.log(
          chalk.yellow("💡 Run 'wrangler login' manually and try again.")
        );
        process.exit(1);
      }
    } else {
      console.log(chalk.red("❌ Cloudflare setup cancelled."));
      console.log(
        chalk.yellow("💡 Run 'wrangler login' to authenticate later.")
      );
      process.exit(1);
    }
  } else {
    console.log(
      chalk.green(`✅ Authenticated as ${authStatus.username || "Cloudflare User"}`)
    );
  }

  // Ask for project name (optional for Cloudflare)
  const { projectName } = await enquirer.prompt<{
    projectName: string;
  }>({
    type: "input",
    name: "projectName",
    message: "Enter a project name (optional):",
    initial: config.projectName || "vibekit-cloudflare",
  });

  console.log(chalk.green("\n✅ Cloudflare provider configured successfully!"));
  console.log(
    chalk.gray(
      "   Note: Cloudflare Workers run in edge locations globally."
    )
  );
  console.log(
    chalk.gray(
      "   Your sandbox will have access to Cloudflare's edge computing capabilities."
    )
  );

  return {
    provider: SANDBOX_PROVIDERS.CLOUDFLARE,
    projectName,
    templates,
  };
}