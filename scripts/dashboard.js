#!/usr/bin/env node

/**
 * VibeKit Dashboard Launcher
 * 
 * Standalone script to start telemetry API server and dashboard.
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
  -p, --port <port>        Telemetry API server port (default: 3000)
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
    const telemetryDir = join(process.cwd(), 'packages', 'telemetry');
    const telemetryCli = join(telemetryDir, 'dist', 'cli', 'TelemetryCLI.js');
    
    // Check if directories exist
    if (!existsSync(dashboardDir)) {
      console.error('❌ Error: Dashboard directory not found at packages/dashboard/');
      process.exit(1);
    }
    
    if (!existsSync(telemetryDir)) {
      console.error('❌ Error: Telemetry package not found at packages/telemetry/');
      process.exit(1);
    }
    
    // Check if telemetry is built
    if (!existsSync(telemetryCli)) {
      console.log('📦 Building telemetry package...');
      execSync('npm run build', { 
        cwd: telemetryDir, 
        stdio: 'inherit' 
      });
    }
    
    console.log('📦 Dashboard will run in development mode (no build needed).');
    
    // Start telemetry API server
    console.log(`🔧 Starting telemetry API server on port ${options.port}...`);
    const telemetryProcess = spawn('node', [telemetryCli, 'api', '--port', options.port], {
      cwd: telemetryDir,
      detached: true,
      stdio: 'ignore',
      env: { 
        ...process.env, 
        HOST: 'localhost' 
      }
    });
    telemetryProcess.unref();
    console.log(`✅ Telemetry API server started (PID: ${telemetryProcess.pid})`);
    
    // Wait a moment for the server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start dashboard server
    console.log(`📊 Starting dashboard in development mode on port ${options.dashboardPort}...`);
    const dashboardProcess = spawn('npm', ['run', 'dev', '--', '-p', options.dashboardPort], {
      cwd: dashboardDir,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        VITE_TELEMETRY_API_URL: `http://localhost:${options.port}`
      }
    });
    dashboardProcess.unref();
    console.log(`✅ Dashboard started (PID: ${dashboardProcess.pid})`);
    
    // Display access URLs
    console.log('\n🎉 Dashboard is running!\n');
    console.log(`📊 Dashboard:     http://localhost:${options.dashboardPort}`);
    console.log(`🔧 Telemetry API: http://localhost:${options.port}`);
    console.log(`🛑 To stop:       Kill processes ${telemetryProcess.pid} and ${dashboardProcess.pid}`);
    
    // Open browser if not disabled
    if (!options.noOpen) {
      const openCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      setTimeout(() => {
        execSync(`${openCommand} http://localhost:${options.dashboardPort}`, { stdio: 'ignore' });
      }, 3000);
    }
    
    // Store PIDs for cleanup
    const cleanup = () => {
      console.log('\n🛑 Shutting down...');
      try {
        process.kill(telemetryProcess.pid);
        process.kill(dashboardProcess.pid);
      } catch (e) {
        // Processes might already be dead
      }
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    // Keep the script running
    await new Promise(() => {});
    
  } catch (error) {
    console.error('\n❌ Error starting dashboard:', error.message);
    process.exit(1);
  }
}

// Run the dashboard launcher
startDashboard();