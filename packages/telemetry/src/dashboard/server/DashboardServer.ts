import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { DashboardOptions } from '../../core/types.js';

export class DashboardServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  
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
    
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`Telemetry dashboard running at http://localhost:${port}`);
        resolve();
      });
    });
  }
  
  private setupRoutes(): void {
    this.app.use(express.json());
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });
    
    // API routes
    this.app.get('/api/events', async (req, res) => {
      try {
        const filter = this.parseQueryFilter(req.query);
        const events = await this.telemetryService.query(filter);
        res.json({ events, count: events.length });
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
    
    this.app.get('/api/metrics', async (req, res) => {
      try {
        const timeRange = this.parseTimeRange(req.query);
        const metrics = await this.telemetryService.getMetrics(timeRange);
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
    
    this.app.get('/api/insights', async (req, res) => {
      try {
        const options = this.parseInsightOptions(req.query);
        const insights = await this.telemetryService.getInsights(options);
        res.json(insights);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
    
    // Export endpoint
    this.app.post('/api/export', async (req, res) => {
      try {
        const { format, filter } = req.body;
        const result = await this.telemetryService.export(
          { type: format },
          filter
        );
        
        const contentType = format === 'csv' ? 'text/csv' : 'application/json';
        const filename = `telemetry-export-${Date.now()}.${format}`;
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(result.data);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
    
    // Serve static dashboard files (placeholder)
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>VibeKit Telemetry Dashboard</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; }
              .container { max-width: 800px; margin: 0 auto; }
              .metric { background: #f5f5f5; padding: 20px; margin: 10px 0; border-radius: 5px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>VibeKit Telemetry Dashboard</h1>
              <p>Dashboard is running. API endpoints available:</p>
              <ul>
                <li><a href="/api/events">/api/events</a> - Query events</li>
                <li><a href="/api/metrics">/api/metrics</a> - Get metrics</li>
                <li><a href="/api/insights">/api/insights</a> - Get insights</li>
                <li><a href="/health">/health</a> - Health check</li>
              </ul>
              <div id="metrics" class="metric">
                <h3>Loading metrics...</h3>
              </div>
            </div>
            <script>
              fetch('/api/metrics')
                .then(r => r.json())
                .then(data => {
                  document.getElementById('metrics').innerHTML = 
                    '<h3>Current Metrics</h3><pre>' + JSON.stringify(data, null, 2) + '</pre>';
                })
                .catch(e => {
                  document.getElementById('metrics').innerHTML = 
                    '<h3>Error loading metrics</h3><p>' + e.message + '</p>';
                });
            </script>
          </body>
        </html>
      `);
    });
  }
  
  private setupWebSocket(): void {
    // Forward telemetry events to dashboard
    this.telemetryService.on('event:tracked', (event: any) => {
      this.io.emit('event', event);
    });
    
    // Handle client connections
    this.io.on('connection', (socket) => {
      console.log('Dashboard client connected');
      
      socket.on('subscribe', (channel: string) => {
        socket.join(channel);
      });
      
      socket.on('disconnect', () => {
        console.log('Dashboard client disconnected');
      });
    });
  }
  
  private parseQueryFilter(query: any): any {
    const filter: any = {};
    
    if (query.sessionId) filter.sessionId = query.sessionId;
    if (query.category) filter.category = query.category;
    if (query.action) filter.action = query.action;
    if (query.eventType) filter.eventType = query.eventType;
    if (query.limit) filter.limit = parseInt(query.limit);
    if (query.offset) filter.offset = parseInt(query.offset);
    
    if (query.start && query.end) {
      filter.timeRange = {
        start: parseInt(query.start),
        end: parseInt(query.end),
      };
    }
    
    return filter;
  }
  
  private parseTimeRange(query: any): any {
    if (query.start && query.end) {
      return {
        start: parseInt(query.start),
        end: parseInt(query.end),
      };
    }
    return undefined;
  }
  
  private parseInsightOptions(query: any): any {
    const options: any = {};
    
    if (query.start && query.end) {
      options.timeRange = {
        start: parseInt(query.start),
        end: parseInt(query.end),
      };
    }
    
    if (query.categories) {
      options.categories = query.categories.split(',');
    }
    
    return options;
  }
  
  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Dashboard server shut down');
        resolve();
      });
    });
  }
}