import { execa } from "execa";
import ora from "ora";
import chalk from "chalk";
import { AGENT_TEMPLATES } from "@vibe-kit/sdk";

import { isCliInstalled } from "../../utils/auth.js";

import { installTemplates, InstallConfig } from "../../utils/install.js";

export async function installDaytona(
  config: InstallConfig,
  selectedTemplates?: string[]
) {
  return installTemplates({
    provider: "Daytona",
    cliCommand: "daytona",
    isInstalled: async () => await isCliInstalled("daytona"),
    buildArgs: (template, config, tempDockerfile) => {
      const snapshotName = config.workspaceId
        ? `${config.workspaceId}-${template}`
        : template;
      return [
        "snapshots",
        "create",
        snapshotName,
        "--cpu",
        config.cpu.toString(),
        "--memory",
        config.memory.toString(),
        "--disk",
        config.disk.toString(),
        "--dockerfile",
        tempDockerfile,
      ];
    },
    needsTempFile: true,
    dockerfilePathPrefix: "assets/dockerfiles/",
    config,
    selectedTemplates,
  });
}
