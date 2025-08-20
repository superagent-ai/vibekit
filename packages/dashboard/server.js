#!/usr/bin/env node

/**
 * Custom Next.js server for VibeKit Dashboard
 * 
 * This server handles:
 * - Settings-based port configuration
 * - Localhost-only binding for security
 * - Graceful shutdown handling
 * - Auto-browser opening
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { promises: fs } = require('fs');
const path = require('path');
const os = require('os');

// Import production systems (only in production builds)
let productionInit;
try {
  productionInit = require('./lib/production-init');
} catch (err) {
  console.log('⚠️  Production monitoring not available (development mode)');
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = '127.0.0.1'; // Localhost only for security
const app = next({ dev, hostname });
const handle = app.getRequestHandler();

// Settings management
const settingsPath = path.join(os.homedir(), '.vibekit', 'settings.json');
const defaultSettings = {
  sandbox: { enabled: false, type: 'docker' },
  proxy: { enabled: true, redactionEnabled: true },
  analytics: { enabled: true },
  aliases: { enabled: false },
  agents: { defaultAgent: 'claude', defaultSandbox: 'dagger' },
  dashboard: { port: 3001, host: '127.0.0.1', autoOpen: true }
};

async function loadSettings() {
  try {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    
    try {
      const content = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(content);
      return { ...defaultSettings, ...settings };
    } catch {
      return defaultSettings;
    }
  } catch (error) {
    console.log('⚠️ Could not load settings, using defaults');
    return defaultSettings;
  }
}

async function startServer() {
  try {
    console.log('🚀 Starting VibeKit Dashboard...');
    
    // Load settings
    const settings = await loadSettings();
    const port = settings.dashboard.port || 3001;
    console.log(`✓ Using port ${port} from settings`);
    
    // Initialize production monitoring systems
    if (productionInit) {
      console.log('🔧 Initializing production monitoring systems...');
      try {
        await productionInit.initializeProduction({
          environment: dev ? 'development' : 'production',
          enableMemoryMonitor: !dev || process.env.ENABLE_MONITORING === 'true',
          enableDiskMonitor: !dev || process.env.ENABLE_MONITORING === 'true',
          enableHealthCheck: true, // Always enable health checks
          enableShutdownCoordinator: true,
          memoryCheckInterval: dev ? 60000 : 30000,
          diskCheckInterval: dev ? 300000 : 60000,
          healthCheckInterval: dev ? 120000 : 30000
        });
        console.log('✓ Production monitoring initialized');
      } catch (err) {
        console.error('⚠️  Failed to initialize production monitoring:', err.message);
        // Continue without monitoring rather than failing to start
      }
    }
    
    // Prepare Next.js app
    await app.prepare();
    console.log('✓ Next.js app prepared');
    
    // Create HTTP server
    const server = createServer(async (req, res) => {
      try {
        // Add security headers for localhost-only access
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        
        // Content Security Policy
        // This policy is strict but allows Next.js to function properly
        const cspDirectives = [
          "default-src 'self'",                           // Default to same-origin only
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires these for HMR in dev
          "style-src 'self' 'unsafe-inline'",             // Next.js inlines critical CSS
          "img-src 'self' data: blob:",                   // Allow images from self, data URIs, and blob URLs
          "font-src 'self' data:",                        // Fonts from self and data URIs
          "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*", // WebSocket for HMR, API calls
          "frame-ancestors 'none'",                       // Prevent embedding (redundant with X-Frame-Options)
          "base-uri 'self'",                              // Prevent base tag injection
          "form-action 'self'",                           // Forms can only submit to same origin
          "upgrade-insecure-requests"                     // Upgrade HTTP to HTTPS (though we're localhost)
        ];
        
        // In production, we can be more strict
        if (process.env.NODE_ENV === 'production') {
          cspDirectives[1] = "script-src 'self'";         // Remove unsafe-eval and unsafe-inline in production
          cspDirectives[2] = "style-src 'self'";          // Remove unsafe-inline for styles in production
        }
        
        res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
        
        // Parse the URL
        const parsedUrl = parse(req.url, true);
        
        // Handle the request
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error handling request:', err);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
    
    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        // Use production shutdown if available
        if (productionInit && productionInit.shutdownCoordinator) {
          console.log('📊 Shutting down production monitoring...');
          await productionInit.shutdownProduction({
            gracePeriod: 10000,
            forceTimeout: 30000
          });
          console.log('✓ Production monitoring stopped');
        }
        
        // Close the server
        await new Promise((resolve) => {
          server.close(resolve);
        });
        console.log('✓ HTTP server closed');
        
        // Close Next.js app
        await app.close();
        console.log('✓ Next.js app closed');
        
        console.log('✓ Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('❌ Uncaught exception:', error);
      await gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
      await gracefulShutdown('unhandledRejection');
    });
    
    // Start listening
    server.listen(port, hostname, (err) => {
      if (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
      }
      
      const url = `http://${hostname}:${port}`;
      console.log(`\n🎉 VibeKit Dashboard ready!`);
      console.log(`   Local: ${url}`);
      console.log(`   Process ID: ${process.pid}`);
      console.log(`\n💡 Press Ctrl+C to stop\n`);
      
      // Open browser automatically if settings allow
      if (settings.dashboard.autoOpen !== false && process.env.OPEN_BROWSER !== 'false') {
        import('open').then(({ default: open }) => {
          open(url).catch(err => {
            console.log('⚠️  Could not open browser automatically:', err.message);
            console.log(`   Please open ${url} manually`);
          });
        }).catch(err => {
          console.log('⚠️  Could not load browser opener:', err.message);
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle CLI coordination
if (process.argv.includes('--check-status')) {
  // CLI wants to check if dashboard is running
  loadSettings()
    .then(settings => {
      const port = settings.dashboard.port || 3001;
      const url = `http://127.0.0.1:${port}`;
      
      // Simple check to see if something is listening on the port
      const http = require('http');
      const req = http.request({ 
        hostname: '127.0.0.1', 
        port: port, 
        timeout: 1000, 
        method: 'GET',
        path: '/api/health'
      }, (res) => {
        console.log(url);
        process.exit(0);
      });
      
      req.on('error', () => {
        console.log('not-running');
        process.exit(1);
      });
      
      req.on('timeout', () => {
        console.log('not-running');
        process.exit(1);
      });
      
      req.end();
    })
    .catch(err => {
      console.error('Error checking status:', err);
      process.exit(1);
    });
} else if (process.argv.includes('--get-port')) {
  // CLI wants to know the configured port
  loadSettings()
    .then(settings => {
      const port = settings.dashboard.port || 3001;
      console.log(port);
      process.exit(0);
    })
    .catch(err => {
      console.error('Error getting port:', err);
      process.exit(1);
    });
} else {
  // Normal startup
  startServer();
}