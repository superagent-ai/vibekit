#!/usr/bin/env node

/**
 * VibeKit Dashboard Launcher
 * 
 * Standalone script to start telemetry server and dashboard without CLI dependencies.
 * Use this if you encounter CLI build issues.
 * 
 * Usage: node scripts/dashboard.js [--no-open] [--port 3000] [--dashboard-port 3001]
 */

import { spawn, execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  port: '3000',
  dashboardPort: '3001',
  noOpen: false
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--port':
    case '-p':
      options.port = args[++i];
      break;
    case '--dashboard-port':
      options.dashboardPort = args[++i];
      break;
    case '--no-open':
      options.noOpen = true;
      break;
    case '--help':
    case '-h':
      console.log(`
VibeKit Dashboard Launcher

Usage: node scripts/dashboard.js [options]

Options:
  -p, --port <port>        Telemetry server port (default: 3000)
  --dashboard-port <port>  Dashboard port (default: 3001)
  --no-open                Skip opening browser automatically
  -h, --help               Show this help message

Examples:
  node scripts/dashboard.js
  node scripts/dashboard.js --no-open
  node scripts/dashboard.js --port 4000 --dashboard-port 4001
`);
      process.exit(0);
  }
}

async function startDashboard() {
  try {
    console.log('🚀 Starting VibeKit Dashboard...');
    
    // Define paths
    const dashboardDir = join(process.cwd(), 'packages', 'dashboard');
    const serverScript = join(process.cwd(), 'scripts', 'telemetry-server.js');
    
    // Check if directories exist
    if (!existsSync(dashboardDir)) {
      console.error('❌ Error: Dashboard directory not found at packages/dashboard/');
      process.exit(1);
    }
    
    if (!existsSync(serverScript)) {
      console.error('❌ Error: Telemetry server script not found at scripts/telemetry-server.js');
      process.exit(1);
    }
    
    console.log('📦 Dashboard will run in development mode (no build needed).');
    
    // Start telemetry server
    console.log(`🔧 Starting telemetry server on port ${options.port}...`);
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
    telemetryProcess.unref();
    console.log(`✅ Telemetry server started (PID: ${telemetryProcess.pid})`);
    
    // Start dashboard server
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
    
    // Open browser (unless --no-open flag is used)
    const dashboardUrl = `http://localhost:${options.dashboardPort}`;
    if (!options.noOpen) {
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
    
    // Success message
    console.log('\n🎉 VibeKit Dashboard is running!');
    console.log('📊 Services:');
    console.log(`   • Telemetry Server: http://localhost:${options.port}`);
    console.log(`   • Dashboard UI: ${dashboardUrl}`);
    console.log(`\n💡 Tips:`);
    console.log('   • Press Ctrl+C to stop this script (servers will continue running)');
    console.log('   • Servers are running in background and will persist after script exit');
    console.log(`   • To stop servers manually, use: kill ${telemetryProcess.pid} ${dashboardProcess.pid}`);
    
    // Graceful shutdown handler
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
    console.error('❌ Dashboard startup failed:', error.message);
    process.exit(1);
  }
}

startDashboard(); 