#!/usr/bin/env node

/**
 * VibeKit Dashboard CLI Entry Point
 * 
 * This script is the main entry point for the dashboard when run as a standalone package.
 * It uses our custom server with port management for secure local development.
 */

// Forward all arguments to the server
process.argv = ['node', require.resolve('../server.js'), ...process.argv.slice(2)];

// Run the server
require('../server.js');