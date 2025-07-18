import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { registerTelemetryCommands } from "./commands/telemetry.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf8")
);

const program = new Command();

program
  .name("vibekit")
  .description("VibeKit development environment manager")
  .version(packageJson.version);

program
  .command("init")
  .description("Initialize VibeKit providers")
  .option(
    "-p, --providers <providers>",
    "Comma-separated list of providers to install (e.g., E2B,Daytona,Northflank)"
  )
  .option(
    "-a, --agents <agents>",
    "Comma-separated list of agent templates to install (e.g., claude,codex,gemini)"
  )
  .option(
    "-c, --cpu <cores>",
    "CPU cores per provider (Recommended: 2-4 cores)"
  )
  .option(
    "-m, --memory <mb>",
    "Memory per provider in MB (Recommended: 1024-4096 MB)"
  )
  .option(
    "-d, --disk <gb>",
    "Disk space per provider in GB (Recommended: 10-50 GB)"
  )
  .option(
    "-P, --project-id <id>",
    "Project ID for Northflank (can also use NORTHFLANK_PROJECT_ID env var)"
  )
  .option(
    "-w, --workspace-id <id>",
    "Workspace ID for Daytona workspace naming (can also use DAYTONA_WORKSPACE_ID env var)"
  )
  .action(initCommand);

// Register telemetry commands
registerTelemetryCommands(program);

program.parse(process.argv);
