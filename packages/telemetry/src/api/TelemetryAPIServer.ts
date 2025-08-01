import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import chokidar from 'chokidar';
import { resolve, normalize, isAbsolute } from 'path';
import type { DashboardOptions } from '../core/types.js';
import { createAuthMiddleware, type AuthConfig } from './middleware/auth.js';
import { 
  validateQuery, 
  queryFilterSchema, 
  exportQuerySchema, 
  insightQuerySchema 
} from './middleware/validation.js';

export class TelemetryAPIServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  private dbWatcher?: chokidar.FSWatcher;
  private debounceTimer?: NodeJS.Timeout;
  
  constructor(
    private telemetryService: any,
    private options: DashboardOptions = {}
  ) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.setupRoutes();
    this.setupWebSocket();
  }
  
  async start(): Promise<void> {
    const port = this.options.port || 3000;
    
    // Set up database file watching
    this.setupDatabaseWatcher();
    
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`Telemetry API server running at http://localhost:${port}`);
        resolve();
      });
    });
  }
  
  private setupRoutes(): void {
    // Security middleware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
        },
      },
    }));
    
    // CORS configuration - restrict to specific origins
    const allowedOrigins = process.env.TELEMETRY_ALLOWED_ORIGINS?.split(',') || [];
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        // Check if origin is allowed
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    
    // Apply rate limiting to all routes
    this.app.use('/api/', limiter);
    
    // JSON body parser with size limit
    this.app.use(express.json({ limit: '1mb' }));
    
    // Authentication middleware
    const authConfig: AuthConfig = {
      enabled: process.env.TELEMETRY_AUTH_ENABLED === 'true',
      apiKeys: process.env.TELEMETRY_API_KEYS?.split(',').filter(Boolean),
      bearerTokens: process.env.TELEMETRY_BEARER_TOKENS?.split(',').filter(Boolean),
    };
    const authMiddleware = createAuthMiddleware(authConfig);
    
    // Apply auth to all API routes except health check
    this.app.use('/api/', authMiddleware);
    
    // Root endpoint - API info (no auth required)
    this.app.get('/', (req, res) => {
      res.json({
        service: 'VibeKit Telemetry Server',
        version: '0.0.1',
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
        }
      });
    });
    
    // Health endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = this.telemetryService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ 
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      try {
        const timeRange = this.parseTimeRange(req.query);
        const metrics = await this.telemetryService.getMetrics(timeRange);
        
        // Transform to match expected format
        const response = {
          realTime: metrics.realTime || [],
          performance: metrics.performance || {
            avgLatency: 0,
            p95Latency: 0,
            throughput: 0
          },
          events: metrics.events || {
            total: 0,
            start: 0,
            stream: 0,
            end: 0,
            error: 0
          },
          errors: metrics.errors || {
            total: 0,
            circuitBreakerTrips: 0,
            rateLimitHits: 0,
            retryQueueOverflows: 0
          },
          health: metrics.health || {
            uptime: process.uptime(),
            lastHealthCheck: Date.now()
          },
          timestamp: new Date().toISOString(),
          server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
          }
        };
        
        res.json(response);
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to retrieve metrics',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Analytics endpoint
    this.app.get('/analytics', async (req, res) => {
      try {
        const window = (req.query.window as string) || 'day';
        const insights = await this.telemetryService.getInsights({ window });
        
        // Transform to analytics dashboard format
        const analytics = {
          timeWindow: window,
          overview: {
            totalSessions: insights.totalSessions || 0,
            totalEvents: insights.totalEvents || 0,
            avgResponseTime: insights.avgResponseTime || 0,
            errorRate: insights.errorRate || 0,
            throughput: insights.throughput || 0
          },
          health: {
            status: 'healthy',
            checks: {}
          },
          realTime: [],
          performance: [],
          sessionSummaries: [],
          anomalies: [],
          topAgents: [],
          message: 'Analytics data retrieved successfully',
          source: 'telemetry-api',
          lastUpdated: Date.now(),
          timestamp: new Date().toISOString()
        };
        
        res.json(analytics);
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to retrieve analytics',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Query endpoint (for sessions)
    this.app.get('/query', async (req, res) => {
      try {
        const { limit = '50', agent, session, since, until } = req.query;
        
        const filter: any = {
          limit: parseInt(limit as string),
          offset: 0
        };
        
        if (agent) filter.category = agent;
        if (session) filter.sessionId = session;
        if (since || until) {
          filter.timeRange = {
            start: since ? new Date(since as string).getTime() : undefined,
            end: until ? new Date(until as string).getTime() : undefined
          };
        }
        
        const events = await this.telemetryService.query(filter);
        
        // Group by sessions for compatibility
        const sessionMap = new Map<string, any>();
        for (const event of events) {
          if (!sessionMap.has(event.sessionId)) {
            sessionMap.set(event.sessionId, {
              id: event.sessionId,
              agentType: event.category,
              mode: event.action,
              status: 'active',
              startTime: event.timestamp,
              endTime: null,
              duration: null,
              eventCount: 0,
              streamEventCount: 0,
              errorCount: 0,
              sandboxId: null,
              repoUrl: null,
              metadata: null,
              createdAt: event.timestamp,
              updatedAt: event.timestamp,
              version: 1,
              schemaVersion: '1.0.0'
            });
          }
          
          const session = sessionMap.get(event.sessionId);
          session.eventCount++;
          
          if (event.eventType === 'stream') {
            session.streamEventCount++;
          } else if (event.eventType === 'error') {
            session.errorCount++;
          } else if (event.eventType === 'end') {
            session.status = 'completed';
            session.endTime = event.timestamp;
            session.duration = event.timestamp - session.startTime;
          }
          
          session.updatedAt = event.timestamp;
        }
        
        const results = Array.from(sessionMap.values());
        
        res.json({
          results,
          query: req.query,
          count: results.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to query telemetry data',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Test event endpoint
    this.app.post('/test-event', async (req, res) => {
      try {
        const eventData = req.body || {};
        
        const testEvent = {
          type: eventData.type || 'test',
          data: {
            ...eventData,
            testId: `test-${Date.now()}`,
            source: 'dashboard',
            timestamp: new Date().toISOString()
          }
        };
        
        // Broadcast to connected clients
        this.io.to('events').emit('update:event', testEvent);
        this.io.to('metrics').emit('update:metrics', { 
          testEvent: true, 
          timestamp: new Date().toISOString() 
        });
        
        res.json({
          success: true,
          message: 'Test event broadcasted successfully',
          event: testEvent,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to trigger test event',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Session events endpoint
    this.app.get('/sessions/:sessionId/events', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { limit = '100', offset = '0' } = req.query;
        
        const events = await this.telemetryService.query({
          sessionId,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        });
        
        res.json({
          sessionId,
          events,
          count: events.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to query session events',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Legacy API routes for compatibility
    this.app.get('/api/health', async (req, res) => {
      const health = this.telemetryService.getHealthStatus();
      res.json(health);
    });
    
    this.app.get('/api/events', async (req, res) => {
      const filter = this.parseQueryFilter(req.query);
      const events = await this.telemetryService.query(filter);
      res.json(events);
    });
    
    this.app.get('/api/metrics', async (req, res) => {
      const timeRange = this.parseTimeRange(req.query);
      const metrics = await this.telemetryService.getMetrics(timeRange);
      res.json(metrics);
    });
    
    this.app.get('/api/insights', async (req, res) => {
      const options = this.parseInsightOptions(req.query);
      const insights = await this.telemetryService.getInsights(options);
      res.json(insights);
    });
    
    this.app.get('/api/sessions', async (req, res) => {
      const sessions = await this.telemetryService.getActiveSessions();
      res.json(sessions);
    });
    
    this.app.get('/api/sessions/:sessionId', async (req, res) => {
      const { sessionId } = req.params;
      const session = await this.telemetryService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json(session);
    });
    
    this.app.post('/api/export', async (req, res) => {
      const { format, filter } = req.body;
      const result = await this.telemetryService.export(
        { type: format },
        filter
      );
      
      const contentType = format === 'csv' ? 'text/csv' : 'application/json';
      const filename = `telemetry-export-${Date.now()}.${format}`;
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(result);
    });
  }
  
  private setupWebSocket(): void {
    // Forward telemetry events to dashboard
    this.telemetryService.on('event:tracked', (event: any) => {
      this.io.emit('event', event);
      this.io.to('events').emit('update:event', { 
        type: event.eventType, 
        data: event 
      });
    });
    
    // Handle client connections
    this.io.on('connection', (socket) => {
      console.log('API client connected');
      
      socket.on('subscribe', (channel: string) => {
        socket.join(channel);
        console.log(`Client subscribed to channel: ${channel}`);
      });
      
      socket.on('unsubscribe', (channel: string) => {
        socket.leave(channel);
        console.log(`Client unsubscribed from channel: ${channel}`);
      });
      
      socket.on('disconnect', () => {
        console.log('API client disconnected');
      });
    });
  }
  
  private parseQueryFilter(query: any): any {
    const filter: any = {};
    
    // All values have been validated by middleware
    if (query.sessionId) filter.sessionId = query.sessionId;
    if (query.category) filter.category = query.category;
    if (query.action) filter.action = query.action;
    if (query.eventType) filter.eventType = query.eventType;
    if (query.limit !== undefined) filter.limit = query.limit;
    if (query.offset !== undefined) filter.offset = query.offset;
    
    if (query.start !== undefined && query.end !== undefined) {
      filter.timeRange = {
        start: query.start,
        end: query.end,
      };
    }
    
    return filter;
  }
  
  private parseTimeRange(query: any): any {
    if (query.start !== undefined && query.end !== undefined) {
      return {
        start: query.start, // Already validated as number
        end: query.end,     // Already validated as number
      };
    }
    return undefined;
  }
  
  private parseInsightOptions(query: any): any {
    const options: any = {};
    
    if (query.start !== undefined && query.end !== undefined) {
      options.timeRange = {
        start: query.start, // Already validated as number
        end: query.end,     // Already validated as number
      };
    }
    
    if (query.categories) {
      // Validate individual categories after split
      const categories = query.categories.split(',').filter((c: string) => c.trim());
      if (categories.length > 0) {
        options.categories = categories.map((c: string) => c.trim());
      }
    }
    
    if (query.window) {
      options.window = query.window;
    }
    
    return options;
  }
  
  private validateDatabasePath(inputPath: string): string {
    // Normalize the path to resolve any '..' or '.' segments
    const normalizedPath = normalize(inputPath);
    
    // Get absolute path
    const absolutePath = isAbsolute(normalizedPath) 
      ? normalizedPath 
      : resolve(process.cwd(), normalizedPath);
    
    // Define allowed base directories
    const allowedBaseDirs = [
      process.cwd(),
      resolve(process.cwd(), '.vibekit'),
      resolve(process.cwd(), 'data'),
      '/tmp/vibekit', // For temporary files
    ];
    
    // Check if the path is within allowed directories
    const isAllowed = allowedBaseDirs.some(baseDir => {
      const resolvedBase = resolve(baseDir);
      return absolutePath.startsWith(resolvedBase);
    });
    
    if (!isAllowed) {
      throw new Error(
        `Database path '${inputPath}' is outside allowed directories. ` +
        `Path must be within project directory or designated data folders.`
      );
    }
    
    // Additional security checks
    if (absolutePath.includes('..')) {
      throw new Error('Database path cannot contain ".." after normalization');
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\/etc\//,
      /\/sys\//,
      /\/proc\//,
      /\.ssh/,
      /\.env/,
      /private/i,
      /secret/i,
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(absolutePath))) {
      throw new Error('Database path contains suspicious patterns');
    }
    
    return absolutePath;
  }
  
  async shutdown(): Promise<void> {
    // Close database watcher
    if (this.dbWatcher) {
      await this.dbWatcher.close();
    }
    
    // Clear any pending timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // Close socket connections
    this.io.close();
    
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Telemetry API server shut down');
        resolve();
      });
    });
  }
  
  private setupDatabaseWatcher(): void {
    // Get database path from telemetry config
    const configPath = this.telemetryService.config?.storage?.[0]?.options?.path || '.vibekit/telemetry.db';
    
    // Validate and normalize the path
    const dbPath = this.validateDatabasePath(configPath);
    
    console.log(`👁️  Setting up database watcher for: ${dbPath}`);
    
    this.dbWatcher = chokidar.watch(dbPath, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
      usePolling: false, // Use native fs events
    });
    
    // Handle database changes
    this.dbWatcher.on('change', async (path) => {
      console.log(`🔔 Database file changed: ${path}`);
      
      // Debounce multiple rapid changes
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(async () => {
        try {
          // Query updated data
          const [metrics, insights, sessions] = await Promise.all([
            this.telemetryService.getMetrics().catch((err: any) => {
              console.warn('Failed to get metrics:', err.message);
              return null;
            }),
            this.telemetryService.getInsights({ window: 'day' }).catch((err: any) => {
              console.warn('Failed to get insights:', err.message);
              return null;
            }),
            this.telemetryService.query({ limit: 10 }).catch((err: any) => {
              console.warn('Failed to query events:', err.message);
              return [];
            })
          ]);
          
          // Broadcast updates to connected clients
          if (metrics) {
            this.io.to('metrics').emit('update:metrics', {
              realTime: metrics.realTime || [],
              timestamp: new Date().toISOString(),
            });
          }
          
          if (insights) {
            const analytics = {
              timeWindow: 'day',
              overview: {
                totalSessions: insights.totalSessions || 0,
                totalEvents: insights.totalEvents || 0,
                avgResponseTime: insights.avgResponseTime || 0,
                errorRate: insights.errorRate || 0,
                throughput: insights.throughput || 0
              },
              timestamp: new Date().toISOString()
            };
            this.io.to('events').emit('update:analytics', analytics);
          }
          
          if (sessions && sessions.length > 0) {
            // Group events by session
            const sessionMap = new Map<string, any>();
            for (const event of sessions) {
              if (!sessionMap.has(event.sessionId)) {
                sessionMap.set(event.sessionId, {
                  id: event.sessionId,
                  agentType: event.category,
                  eventCount: 0,
                  status: 'active'
                });
              }
              const session = sessionMap.get(event.sessionId);
              session.eventCount++;
              if (event.eventType === 'end') {
                session.status = 'completed';
              }
            }
            
            this.io.to('events').emit('update:sessions', {
              sessions: Array.from(sessionMap.values()),
              timestamp: new Date().toISOString(),
            });
          }
          
          // Broadcast general update event
          this.io.to('events').emit('update:event', {
            type: 'database_change',
            data: {
              hasMetrics: !!metrics,
              hasInsights: !!insights,
              hasSessions: sessions.length > 0,
              timestamp: new Date().toISOString()
            }
          });
          
          console.log(`📡 Broadcasted real-time updates to connected clients`);
          
        } catch (error) {
          console.error('❌ Error broadcasting real-time updates:', error);
        }
      }, 300); // Debounce by 300ms
    });
    
    this.dbWatcher.on('error', (error) => {
      console.error('❌ Database watcher error:', error);
    });
    
    this.dbWatcher.on('ready', () => {
      console.log('👁️  Database watcher is ready and monitoring for changes');
    });
  }
}