import { execa } from "execa";
import enquirer from "enquirer";
import ora from "ora";
import chalk from "chalk";

import { SANDBOX_PROVIDERS } from "../../constants/enums.js";

export interface AuthStatus {
  isAuthenticated: boolean;
  username?: string;
  provider: SANDBOX_PROVIDERS;
  needsInstall?: boolean;
}

type ProviderAuthConfig = {
  cliName: string;
  installInstructions: string;
  checkAuthCommand: string[];
  parseAuthOutput: (
    stdout: string,
    stderr: string
  ) => { isAuthenticated: boolean; username?: string };
  loginCommand: string[];
  needsBrowserOpen?: boolean;
};

const authConfigs: Record<SANDBOX_PROVIDERS, ProviderAuthConfig> = {
  [SANDBOX_PROVIDERS.E2B]: {
    cliName: "e2b",
    installInstructions: "npm install -g @e2b/cli",
    checkAuthCommand: ["auth", "info"],
    parseAuthOutput: (stdout) => ({
      isAuthenticated:
        !stdout.includes("Not logged in") && !stdout.includes("not logged in"),
      username: "E2B User",
    }),
    loginCommand: ["auth", "login"],
    needsBrowserOpen: true,
  },
  [SANDBOX_PROVIDERS.DAYTONA]: {
    cliName: "daytona",
    installInstructions:
      process.platform === "win32"
        ? 'powershell -Command "irm https://get.daytona.io/windows | iex"'
        : "brew install daytonaio/cli/daytona",
    checkAuthCommand: ["organization", "list"],
    parseAuthOutput: (stdout, stderr) => {
      const isAuthError =
        stderr &&
        (stderr.toLowerCase().includes("authentication") ||
          stderr.toLowerCase().includes("login") ||
          stderr.toLowerCase().includes("unauthorized") ||
          stderr.toLowerCase().includes("not logged in"));
      let username = "Daytona User";
      if (stdout) {
        const emailMatch = stdout.match(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
        );
        if (emailMatch) username = emailMatch[0];
      }
      return { isAuthenticated: !isAuthError, username };
    },
    loginCommand: ["login"],
  },
  [SANDBOX_PROVIDERS.DAGGER]: {
    cliName: "dagger",
    installInstructions:
      "curl -fsSL https://dl.dagger.io/dagger/install.sh | sh",
    checkAuthCommand: ["version"],
    parseAuthOutput: (stdout) => ({
      isAuthenticated:
        stdout.includes("dagger") && !stdout.includes("command not found"),
      username: "Local User",
    }),
    loginCommand: [], // No login required for local Dagger
  },
  [SANDBOX_PROVIDERS.NORTHFLANK]: {
    cliName: "northflank",
    installInstructions: "npm install -g @northflank/cli",
    checkAuthCommand: ["context", "ls"],
    parseAuthOutput: (stdout, stderr) => {
      // Check for authentication based on context output
      // When not logged in: "No contexts found"
      // When logged in: Shows actual context information
      const isNotLoggedIn =
        stdout &&
        (stdout.includes("No contexts found") ||
          stdout.toLowerCase().includes("no contexts found"));

      const isAuthError =
        stderr &&
        (stderr.toLowerCase().includes("authentication") ||
          stderr.toLowerCase().includes("login") ||
          stderr.toLowerCase().includes("unauthorized"));

      const isAuthenticated = !isNotLoggedIn && !isAuthError && !!stdout;

      let username = "Northflank User";
      // Try to extract email or username from context output if available
      if (stdout && isAuthenticated) {
        const emailMatch = stdout.match(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
        );
        if (emailMatch) username = emailMatch[0];
      }

      return { isAuthenticated, username };
    },
    loginCommand: ["login"],
    needsBrowserOpen: true,
  },
};

export async function isCliInstalled(command: string): Promise<boolean> {
  try {
    await execa(command, ["--version"]);
    return true;
  } catch (error) {
    return false;
  }
}

export async function checkAuth(
  provider: SANDBOX_PROVIDERS
): Promise<AuthStatus> {
  const config = authConfigs[provider];
  const isInstalled = await isCliInstalled(config.cliName);

  if (!isInstalled) {
    return { isAuthenticated: false, provider, needsInstall: true };
  }

  try {
    const { stdout, stderr } = await execa(
      config.cliName,
      config.checkAuthCommand,
      { reject: false }
    );
    const { isAuthenticated, username } = config.parseAuthOutput(
      stdout,
      stderr
    );
    return { isAuthenticated, username, provider };
  } catch (error) {
    console.error(
      chalk.gray(
        `Error checking ${provider} auth: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    return { isAuthenticated: false, provider };
  }
}

async function installE2BCli(): Promise<boolean> {
  const spinner = ora("Installing E2B CLI...").start();
  try {
    // Install E2B CLI via npm (cross-platform)
    await execa("npm", ["install", "-g", "@e2b/cli"]);
    spinner.succeed("E2B CLI installed successfully");
    return true;
  } catch (error) {
    spinner.fail("Failed to install E2B CLI");
    console.error(
      chalk.red("Please install it manually: npm install -g @e2b/cli")
    );
    return false;
  }
}

async function installDaytonaCli(): Promise<boolean> {
  const spinner = ora("Installing Daytona CLI...").start();
  try {
    const platform = process.platform;

    if (platform === "win32") {
      // Windows installation using the official PowerShell script
      await execa("powershell", [
        "-Command",
        "irm https://get.daytona.io/windows | iex",
      ]);
    } else {
      // macOS and Linux installation using Homebrew
      // First check if Homebrew is installed
      try {
        await execa("brew", ["--version"]);
      } catch (error) {
        spinner.fail(
          "Homebrew is required to install Daytona CLI on macOS/Linux"
        );
        console.error(
          chalk.red("Please install Homebrew first: https://brew.sh")
        );
        return false;
      }

      await execa("brew", ["install", "daytonaio/cli/daytona"]);
    }

    spinner.succeed("Daytona CLI installed successfully");
    return true;
  } catch (error) {
    spinner.fail("Failed to install Daytona CLI");
    const platform = process.platform;
    const installCmd =
      platform === "win32"
        ? 'powershell -Command "irm https://get.daytona.io/windows | iex"'
        : "brew install daytonaio/cli/daytona";
    console.error(chalk.red(`Please install it manually: ${installCmd}`));
    return false;
  }
}

export async function authenticate(
  provider: SANDBOX_PROVIDERS
): Promise<boolean> {
  const config = authConfigs[provider];
  const spinner = ora(
    `Authenticating with ${provider.toUpperCase()}...`
  ).start();

  try {
    const isInstalled = await isCliInstalled(config.cliName);

    if (!isInstalled) {
      spinner.info(`${provider} CLI not found`);
      const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
        type: "confirm",
        name: "confirm",
        message: `Would you like to install ${provider} CLI now?`,
        initial: true,
      });

      if (confirm) {
        const installed = await installCli(provider);
        if (!installed) return false;
      } else {
        console.log(
          chalk.yellow(
            `\nPlease install ${provider} CLI manually: ${config.installInstructions}`
          )
        );
        return false;
      }
    }

    // Run login
    spinner.text = `Running ${provider} login...`;
    await execa(config.cliName, config.loginCommand, { stdio: "inherit" });

    // Verify with retries
    const maxRetries = 5;
    const retryDelay = 2000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const verifiedAuth = await checkAuth(provider);
      if (verifiedAuth.isAuthenticated) {
        spinner.succeed(
          `Successfully authenticated with ${provider} as ${verifiedAuth.username}`
        );
        return true;
      }
      if (attempt < maxRetries) {
        spinner.text = `Waiting for ${provider} authentication to complete (${attempt}/${maxRetries})...`;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    spinner.fail(
      `Failed to verify ${provider} authentication. Please try again.`
    );
    return false;
  } catch (error) {
    spinner.fail(
      chalk.red(`Failed to authenticate with ${provider.toUpperCase()}`)
    );
    console.error(
      chalk.red(error instanceof Error ? error.message : "Unknown error")
    );
    return false;
  }
}

async function installCli(provider: SANDBOX_PROVIDERS): Promise<boolean> {
  const config = authConfigs[provider];
  const spinner = ora(`Installing ${provider} CLI...`).start();
  try {
    if (provider === SANDBOX_PROVIDERS.E2B) {
      await execa("npm", ["install", "-g", "@e2b/cli"]);
    } else if (provider === SANDBOX_PROVIDERS.NORTHFLANK) {
      await execa("npm", ["install", "-g", "@northflank/cli"]);
    } else if (provider === SANDBOX_PROVIDERS.DAGGER) {
      await execa("curl", [
        "-fsSL",
        "https://dl.dagger.io/dagger/install.sh",
        "|",
        "sh",
      ]);
    } else if (provider === SANDBOX_PROVIDERS.DAYTONA) {
      if (process.platform === "win32") {
        await execa("powershell", [
          "-Command",
          "irm https://get.daytona.io/windows | iex",
        ]);
      } else {
        await execa("brew", ["install", "daytonaio/cli/daytona"]);
      }
    }
    spinner.succeed(`${provider} CLI installed successfully`);
    return true;
  } catch (error) {
    spinner.fail(`Failed to install ${provider} CLI`);
    console.error(
      chalk.red(`Please install it manually: ${config.installInstructions}`)
    );
    return false;
  }
}
