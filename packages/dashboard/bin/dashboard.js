#!/usr/bin/env node

const DashboardServer = require('../server.js');

const args = process.argv.slice(2);
const port = args.find(arg => arg.startsWith('--port='))?.split('=')[1] || 
             args[args.indexOf('--port') + 1] || 3001;

const server = new DashboardServer({ 
  port: parseInt(port) 
});

server.start().catch(error => {
  console.error('Failed to start dashboard:', error.message);
  process.exit(1);
});