#!/usr/bin/env node

/**
 * Simple Telemetry HTTP Server
 * 
 * Provides HTTP endpoints for telemetry data using Node.js built-in modules.
 * Run with: node scripts/telemetry-server.js
 */

import http from 'http';
import url from 'url';
import { spawn } from 'child_process';
import { Server as SocketIOServer } from 'socket.io';
import { createTelemetryService as createTelemetryServiceClass } from '../packages/vibekit/dist/index.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// CORS helper
function addCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// JSON response helper
function sendJSON(res, statusCode, data) {
  addCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

// Create TelemetryService helper
async function createTelemetryService() {
  const TelemetryServiceClass = await createTelemetryServiceClass();
  
  const config = {
    isEnabled: true,
    localStore: {
      isEnabled: true,
      path: '.vibekit/telemetry.db',
      streamBatchSize: 50,
      streamFlushIntervalMs: 1000,
    }
  };
  
  const service = new TelemetryServiceClass(config);
  await service.initialize();
  return service;
}

// Execute CLI command helper
function executeTelemetryCommand(args) {
  return new Promise((resolve, reject) => {
    const cmd = spawn('node', ['packages/vibekit/dist/cli/index.js', 'telemetry', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    cmd.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    cmd.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    cmd.on('close', (code) => {
      if (code === 0) {
        try {
          // Extract JSON from output (look for { or [ at start of line)
          const lines = stdout.split('\n');
          let jsonStart = -1;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('{') || line.startsWith('[')) {
              jsonStart = i;
              break;
            }
          }
          
          if (jsonStart >= 0) {
            const jsonLines = lines.slice(jsonStart);
            const jsonText = jsonLines.join('\n').trim();
            const result = JSON.parse(jsonText);
            resolve(result);
          } else {
            // No JSON found, return as raw output
            resolve({ output: stdout.trim(), raw: true });
          }
        } catch (error) {
          resolve({ output: stdout.trim(), raw: true, parseError: error.message });
        }
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });

    cmd.on('error', (error) => {
      reject(error);
    });
  });
}

// Route handlers
const routes = {
  '/health': async (req, res) => {
    try {
      if (!telemetryService) {
        throw new Error('TelemetryService not initialized');
      }
      
      const healthStatus = await telemetryService.getHealthStatus();
      const metrics = await telemetryService.getRealTimeMetrics();
      
      const health = {
        status: healthStatus.status,
        timestamp: new Date().toISOString(),
        service: 'vibekit-telemetry',
        database: healthStatus.checks.database,
        analytics: telemetryService.getAnalyticsInfo(),
        export: telemetryService.getExportInfo(),
        metrics: metrics.slice(0, 5), // First 5 metrics
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      };

      sendJSON(res, 200, health);
    } catch (error) {
      sendJSON(res, 500, {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },

  '/metrics': async (req, res) => {
    try {
      if (!telemetryService) {
        throw new Error('TelemetryService not initialized');
      }
      
      const realTimeMetrics = await telemetryService.getRealTimeMetrics();
      const telemetryMetrics = telemetryService.getTelemetryMetrics();
      
      const metrics = {
        realTime: realTimeMetrics,
        performance: telemetryMetrics.performance,
        events: telemetryMetrics.events,
        errors: telemetryMetrics.errors,
        health: telemetryMetrics.health,
        timestamp: new Date().toISOString(),
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        }
      };

      sendJSON(res, 200, metrics);
    } catch (error) {
      sendJSON(res, 500, {
        error: 'Failed to retrieve metrics',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },

  '/analytics': async (req, res) => {
    try {
      if (!telemetryService) {
        throw new Error('TelemetryService not initialized');
      }
      
      const parsedUrl = url.parse(req.url, true);
      const window = parsedUrl.query.window || 'day';
      
      const analytics = await telemetryService.getAnalyticsDashboard(window);
      
      sendJSON(res, 200, {
        ...analytics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      sendJSON(res, 500, {
        error: 'Failed to retrieve analytics',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },

  '/query': async (req, res) => {
    try {
      if (!telemetryService) {
        throw new Error('TelemetryService not initialized');
      }
      
      const parsedUrl = url.parse(req.url, true);
      const { limit = '50', agent, session } = parsedUrl.query;
      
      const filterOptions = {
        limit: parseInt(limit),
        offset: 0,
      };
      if (agent) filterOptions.agentType = agent;
      if (session) filterOptions.sessionId = session;
      
      const results = await telemetryService.getSessionSummaries(filterOptions);
      
      sendJSON(res, 200, {
        results,
        query: parsedUrl.query,
        count: results.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      sendJSON(res, 500, {
        error: 'Failed to query telemetry data',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },

  '/': (req, res) => {
    const apiInfo = {
      service: 'VibeKit Telemetry Server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: {
          path: '/health',
          method: 'GET',
          description: 'Health check and system status'
        },
        metrics: {
          path: '/metrics',
          method: 'GET',
          description: 'System and telemetry metrics'
        },
        analytics: {
          path: '/analytics',
          method: 'GET',
          description: 'Analytics dashboard data',
          parameters: {
            window: 'hour|day|week (default: day)'
          }
        },
        query: {
          path: '/query',
          method: 'GET',
          description: 'Query telemetry data',
          parameters: {
            limit: 'number (default: 50)',
            agent: 'agent type filter',
            session: 'session ID filter'
          }
        }
      },
      examples: [
        `http://${HOST}:${PORT}/health`,
        `http://${HOST}:${PORT}/metrics`,
        `http://${HOST}:${PORT}/analytics?window=day`,
        `http://${HOST}:${PORT}/query?limit=10&agent=claude`
      ]
    };

    sendJSON(res, 200, apiInfo);
  }
};

// Initialize persistent TelemetryService
let telemetryService;

async function initializeTelemetryService() {
  console.log('🔧 Initializing persistent TelemetryService...');
  telemetryService = await createTelemetryService();
  console.log('✅ TelemetryService initialized and ready for real-time events');
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    addCorsHeaders(res);
    res.writeHead(200);
    res.end();
    return;
  }

  // Route request
  const handler = routes[pathname];
  if (handler && req.method === 'GET') {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('Handler error:', error);
      sendJSON(res, 500, {
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    sendJSON(res, 404, {
      error: 'Not Found',
      message: `Endpoint ${req.method} ${pathname} not found`,
      availableEndpoints: Object.keys(routes),
      timestamp: new Date().toISOString(),
    });
  }
});

// Initialize Socket.IO for real-time WebSocket communication
const io = new SocketIOServer(server, { 
  cors: { 
    origin: '*', 
    methods: ['GET', 'POST'] 
  } 
});

// Handle WebSocket connections
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  // Handle subscription requests
  socket.on('subscribe', (channel) => {
    socket.join(channel);
    console.log(`📡 Client ${socket.id} subscribed to channel: ${channel}`);
  });
  
  // Handle unsubscription requests
  socket.on('unsubscribe', (channel) => {
    socket.leave(channel);
    console.log(`📡 Client ${socket.id} unsubscribed from channel: ${channel}`);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Set up event listeners to broadcast telemetry events via WebSockets
function setupEventBroadcasting() {
  if (!telemetryService) return;
  
  // Broadcast individual telemetry events
  telemetryService.on('new:start', (data) => {
    io.to('events').emit('update:event', { type: 'start', data });
  });
  
  telemetryService.on('new:stream', (data) => {
    io.to('events').emit('update:event', { type: 'stream', data });
  });
  
  telemetryService.on('new:end', (data) => {
    io.to('events').emit('update:event', { type: 'end', data });
  });
  
  telemetryService.on('new:error', (data) => {
    io.to('events').emit('update:event', { type: 'error', data });
  });
  
  // Broadcast metrics and health updates
  telemetryService.on('update:metrics', (metrics) => {
    io.to('metrics').emit('update:metrics', metrics);
  });
  
  telemetryService.on('update:health', (health) => {
    io.to('health').emit('update:health', health);
  });
  
  console.log('📻 Real-time event broadcasting configured');
}

// Start server
async function startServer() {
  try {
    // Initialize persistent telemetry service
    await initializeTelemetryService();
    
    // Set up event broadcasting
    setupEventBroadcasting();
    
    // Start HTTP server
    server.listen(PORT, HOST, () => {
      console.log(`🚀 VibeKit Telemetry Server running at http://${HOST}:${PORT}`);
      console.log(`📊 Health: http://${HOST}:${PORT}/health`);
      console.log(`📈 Metrics: http://${HOST}:${PORT}/metrics`);
      console.log(`📊 Analytics: http://${HOST}:${PORT}/analytics`);
      console.log(`🔍 Query: http://${HOST}:${PORT}/query`);
      console.log(`💡 API Info: http://${HOST}:${PORT}/`);
      console.log(`🔌 WebSocket: ws://${HOST}:${PORT} (Socket.IO)`);
      console.log(`📡 Available channels: events, metrics, health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close Socket.IO connections
    if (io) {
      console.log('🔌 Closing WebSocket connections...');
      io.close();
    }
    
    // Shutdown telemetry service
    if (telemetryService) {
      console.log('📊 Shutting down TelemetryService...');
      await telemetryService.shutdown();
    }
    
    // Close HTTP server
    server.close(() => {
      console.log('✅ Server closed gracefully');
      process.exit(0);
    });
    
    // Force exit after 5 seconds if graceful shutdown takes too long
    setTimeout(() => {
      console.log('⏰ Force exit after timeout');
      process.exit(1);
    }, 5000);
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); 