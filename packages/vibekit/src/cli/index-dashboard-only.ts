import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { registerTelemetryCommands } from "./commands/telemetry.js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn, execSync } from "child_process";

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
  .option(
    "-u, --upload-images",
    "Automatically upload images to Docker Hub (requires docker login, local provider only)"
  )
  .option(
    "--no-upload-images",
    "Skip Docker registry setup (local provider only)"
  )
  .action(initCommand);

// Register consolidated telemetry commands (includes all Drizzle features)
registerTelemetryCommands(program);

// Add dashboard command
program
  .command('dashboard')
  .description('Start telemetry server, launch dashboard, and open in browser for realtime stats')
  .option('-p, --port <port>', 'Telemetry server port', '3000')
  .option('--dashboard-port <port>', 'Dashboard port', '3001')
  .option('--no-build', 'Skip dashboard setup steps')
  .option('--no-open', 'Skip opening browser automatically')
  .action(async (options) => {
    try {
      // Define paths
      const dashboardDir = join(process.cwd(), 'packages', 'dashboard');
      const nextBuildDir = join(dashboardDir, '.next');
      
      console.log('🚀 Starting VibeKit Dashboard...');
      
      // Check if dashboard directory exists
      if (!existsSync(dashboardDir)) {
        console.error('❌ Error: Dashboard directory not found at packages/dashboard/');
        console.error('   Make sure you are running this command from the VibeKit project root.');
        process.exit(1);
      }
      
      // Phase 2: Skip build for development mode
      if (options.noBuild) {
        console.log('⏭️  Skipping dashboard build (--no-build flag).');
      } else {
        console.log('📦 Dashboard will run in development mode (no build needed).');
      }
      
      // Phase 3: Start telemetry server
      console.log(`🔧 Starting telemetry server on port ${options.port}...`);
      const serverScript = join(process.cwd(), 'scripts', 'telemetry-server.js');
      
      if (!existsSync(serverScript)) {
        console.error('❌ Error: Telemetry server script not found at scripts/telemetry-server.js');
        process.exit(1);
      }
      
      const telemetryProcess = spawn('node', [serverScript], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
        env: { 
          ...process.env, 
          PORT: options.port, 
          HOST: 'localhost' 
        }
      });
      telemetryProcess.unref(); // Allow CLI to exit independently
      console.log(`✅ Telemetry server started (PID: ${telemetryProcess.pid})`);
      
      // Phase 3: Start dashboard server in development mode
      console.log(`📊 Starting dashboard in development mode on port ${options.dashboardPort}...`);
      const dashboardProcess = spawn('npm', ['run', 'dev', '--', '-p', options.dashboardPort], {
        cwd: dashboardDir,
        detached: true,
        stdio: 'ignore'
      });
      dashboardProcess.unref();
      console.log(`✅ Dashboard started (PID: ${dashboardProcess.pid})`);
      
      // Wait for servers to initialize
      console.log('⏳ Waiting for servers to initialize...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Phase 4: Open browser (unless --no-open flag is used)
      const dashboardUrl = `http://localhost:${options.dashboardPort}`;
      if (options.open !== false) {
        console.log(`🌐 Opening dashboard in browser: ${dashboardUrl}`);
        try {
          spawn('open', [dashboardUrl], { stdio: 'ignore' }); // macOS-specific
          console.log('✅ Browser launched successfully');
        } catch (error) {
          console.warn(`⚠️  Failed to open browser automatically: ${error.message}`);
          console.log(`   Please visit manually: ${dashboardUrl}`);
        }
      } else {
        console.log(`🌐 Dashboard ready at: ${dashboardUrl}`);
        console.log('   (Browser launch skipped due to --no-open flag)');
      }
      
      // Phase 5: Success message and process management info
      console.log('\n🎉 VibeKit Dashboard is running!');
      console.log('📊 Services:');
      console.log(`   • Telemetry Server: http://localhost:${options.port}`);
      console.log(`   • Dashboard UI: ${dashboardUrl}`);
      console.log(`\n💡 Tips:`);
      console.log('   • Press Ctrl+C to stop this command (servers will continue running)');
      console.log('   • Servers are running in background and will persist after CLI exit');
      console.log(`   • To stop servers manually, use: kill ${telemetryProcess.pid} ${dashboardProcess.pid}`);
      
      // Optional: Add graceful shutdown handler
      let shutdownHandled = false;
      const gracefulShutdown = () => {
        if (shutdownHandled) return;
        shutdownHandled = true;
        console.log('\n🛑 Received shutdown signal...');
        console.log('📝 Note: Background servers will continue running');
        console.log('   Use the kill commands above to stop them if needed');
        process.exit(0);
      };
      
      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);
      
    } catch (error) {
      console.error('❌ Dashboard command failed:', error.message);
      process.exit(1);
    }
  });

program.parse(process.argv); 