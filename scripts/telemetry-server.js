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
import chokidar from 'chokidar';
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
        },
        testEvent: {
          path: '/test-event',
          method: 'POST',
          description: 'Trigger a test event for real-time verification'
        },
        refreshStats: {
          path: '/refresh-stats',
          method: 'POST',
          description: 'Refresh session statistics to fix event count discrepancies'
        },
        sessionEvents: {
          path: '/sessions/{sessionId}/events',
          method: 'GET',
          description: 'Get all events for a specific session',
          parameters: {
            sessionId: 'session ID (required in path)',
            limit: 'number (default: 100)',
            offset: 'number (default: 0)'
          }
        }
      },
      examples: [
        `http://${HOST}:${PORT}/health`,
        `http://${HOST}:${PORT}/metrics`,
        `http://${HOST}:${PORT}/analytics?window=day`,
        `http://${HOST}:${PORT}/query?limit=10&agent=claude`,
        `curl -X POST http://${HOST}:${PORT}/test-event`
      ]
    };

    sendJSON(res, 200, apiInfo);
  },

  '/test-event': async (req, res) => {
    try {
      if (req.method !== 'POST') {
        return sendJSON(res, 405, {
          error: 'Method Not Allowed',
          message: 'This endpoint only accepts POST requests',
          timestamp: new Date().toISOString(),
        });
      }

      // Read POST body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const eventData = body ? JSON.parse(body) : {};
          
          // Create a test event
          const testEvent = {
            type: eventData.type || 'test',
            data: {
              ...eventData,
              testId: `test-${Date.now()}`,
              source: 'dashboard',
              timestamp: new Date().toISOString()
            }
          };

          console.log('🧪 Broadcasting test event:', testEvent);

          // Broadcast to all connected clients
          io.to('events').emit('update:event', testEvent);
          
          // Also trigger metrics and analytics updates
          io.to('metrics').emit('update:metrics', { testEvent: true, timestamp: new Date().toISOString() });
          
          sendJSON(res, 200, {
            success: true,
            message: 'Test event broadcasted successfully',
            event: testEvent,
            timestamp: new Date().toISOString(),
          });
        } catch (parseError) {
          sendJSON(res, 400, {
            error: 'Invalid JSON in request body',
            message: parseError.message,
            timestamp: new Date().toISOString(),
          });
        }
      });
    } catch (error) {
      sendJSON(res, 500, {
        error: 'Failed to trigger test event',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },

  '/refresh-stats': async (req, res) => {
    try {
      if (req.method !== 'POST') {
        return sendJSON(res, 405, {
          error: 'Method Not Allowed',
          message: 'This endpoint only accepts POST requests',
          timestamp: new Date().toISOString(),
        });
      }

      if (!telemetryService) {
        return sendJSON(res, 503, {
          error: 'Service Unavailable',
          message: 'TelemetryService not initialized',
          timestamp: new Date().toISOString(),
        });
      }

      console.log('🔄 Refreshing session statistics...');
      
      // Call the refresh method on the database operations
      const dbOps = telemetryService.getDBOperations();
      if (!dbOps || !dbOps.refreshAllSessionStats) {
        return sendJSON(res, 501, {
          error: 'Not Implemented',
          message: 'refreshAllSessionStats method not available',
          timestamp: new Date().toISOString(),
        });
      }

      const result = await dbOps.refreshAllSessionStats();
      
      console.log(`✅ Session stats refresh completed: ${result.updated} updated, ${result.errors} errors`);
      
      // Broadcast update to connected clients
      io.to('events').emit('update:sessions', {
        type: 'stats_refresh',
        result,
        timestamp: new Date().toISOString(),
      });
      
      sendJSON(res, 200, {
        success: true,
        message: 'Session statistics refreshed successfully',
        result,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      console.error('❌ Failed to refresh session statistics:', error);
      sendJSON(res, 500, {
        error: 'Failed to refresh session statistics',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },

  '/sessions': async (req, res) => {
    try {
      if (!telemetryService) {
        throw new Error('TelemetryService not initialized');
      }
      
      const parsedUrl = url.parse(req.url, true);
      const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
      
      // Handle /sessions/{sessionId}/events
      if (pathParts.length === 3 && pathParts[0] === 'sessions' && pathParts[2] === 'events') {
        const sessionId = pathParts[1];
        const { limit = '100', offset = '0' } = parsedUrl.query;
        
        const dbOps = telemetryService.getDBOperations();
        if (!dbOps || !dbOps.queryEvents) {
          return sendJSON(res, 501, {
            error: 'Not Implemented',
            message: 'queryEvents method not available',
            timestamp: new Date().toISOString(),
          });
        }

        const events = await dbOps.queryEvents({
          sessionId,
          limit: parseInt(limit),
          offset: parseInt(offset),
          orderBy: 'timestamp_asc'
        });

        sendJSON(res, 200, {
          sessionId,
          events,
          count: events.length,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      
      // Default: return 404 for unknown session paths
      sendJSON(res, 404, {
        error: 'Not Found',
        message: `Session endpoint ${req.method} ${parsedUrl.pathname} not found`,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      sendJSON(res, 500, {
        error: 'Failed to query session data',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
};

// Initialize persistent TelemetryService
let telemetryService;
let dbWatcher; // Add watcher variable

async function initializeTelemetryService() {
  console.log('🔧 Initializing persistent TelemetryService...');
  telemetryService = await createTelemetryService();
  console.log('✅ TelemetryService initialized and ready for real-time events');
}

// Setup SQLite file watcher for real-time database changes
function setupDatabaseWatcher() {
  const dbPath = '.vibekit/telemetry.db';
  
  console.log(`👁️  Setting up database watcher for: ${dbPath}`);
  
  dbWatcher = chokidar.watch(dbPath, {
    ignored: /(^|[\/\\])\../, // Ignore dotfiles
    persistent: true, // Keep watching even if no listeners
    awaitWriteFinish: { // Wait for writes to stabilize (prevents rapid-fire events)
      stabilityThreshold: 200, // Wait 200ms after last change
      pollInterval: 100, // Check every 100ms during stability period
    },
    usePolling: false, // Use native fs events (faster); set to true if on network FS
  });

  // Debounce multiple rapid changes
  let debounceTimer;
  
  // On file change, query new data and broadcast
  dbWatcher.on('change', async (path) => {
    console.log(`🔔 DB file changed: ${path}`);
    
    // Clear existing timer and set new one
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        if (!telemetryService) {
          console.log('⚠️  TelemetryService not available, skipping update');
          return;
        }

        // Query updated data from multiple sources
        const [metrics, analytics, sessions] = await Promise.all([
          telemetryService.getRealTimeMetrics().catch(err => {
            console.warn('Warning: Failed to get metrics:', err.message);
            return null;
          }),
          telemetryService.getAnalyticsDashboard('day').catch(err => {
            console.warn('Warning: Failed to get analytics:', err.message);
            return null;
          }),
          telemetryService.getSessionSummaries({ limit: 10, offset: 0 }).catch(err => {
            console.warn('Warning: Failed to get sessions:', err.message);
            return null;
          })
        ]);

        // Broadcast updates to different channels
        if (metrics) {
          io.to('metrics').emit('update:metrics', {
            realTime: metrics,
            timestamp: new Date().toISOString(),
          });
        }

        if (analytics) {
          io.to('events').emit('update:analytics', {
            ...analytics,
            timestamp: new Date().toISOString(),
          });
        }

        if (sessions) {
          io.to('events').emit('update:sessions', {
            sessions,
            timestamp: new Date().toISOString(),
          });
        }

        // Broadcast a general data update event
        io.to('events').emit('update:event', {
          type: 'database_change',
          data: {
            hasMetrics: !!metrics,
            hasAnalytics: !!analytics,
            hasSessions: !!sessions,
            timestamp: new Date().toISOString()
          }
        });

        console.log(`📡 Broadcasted real-time updates - Metrics: ${!!metrics}, Analytics: ${!!analytics}, Sessions: ${!!sessions}`);
        
      } catch (error) {
        console.error('❌ Error querying/broadcasting real-time updates:', error);
      }
    }, 300); // Debounce by 300ms
  });

  // Error handling for watcher
  dbWatcher.on('error', (error) => {
    console.error('❌ Chokidar watcher error:', error);
  });

  dbWatcher.on('ready', () => {
    console.log('👁️  Database watcher is ready and monitoring for changes');
  });

  console.log('📻 Real-time database change monitoring configured');
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
  const handler = routes[pathname] || (pathname.startsWith('/sessions') ? routes['/sessions'] : null);
  if (handler && (req.method === 'GET' || (req.method === 'POST' && (pathname === '/test-event' || pathname === '/refresh-stats')))) {
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
    console.log('Emitting event:', 'start', data);
  });
  
  telemetryService.on('new:stream', (data) => {
    io.to('events').emit('update:event', { type: 'stream', data });
    console.log('Emitting event:', 'stream', data);
  });
  
  telemetryService.on('new:end', (data) => {
    io.to('events').emit('update:event', { type: 'end', data });
    console.log('Emitting event:', 'end', data);
  });
  
  telemetryService.on('new:error', (data) => {
    io.to('events').emit('update:event', { type: 'error', data });
    console.log('Emitting event:', 'error', data);
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
    
    // Setup database watcher for real-time updates
    setupDatabaseWatcher();
    
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
    
    // Close database watcher
    if (dbWatcher) {
      console.log('👁️  Closing database watcher...');
      await dbWatcher.close();
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