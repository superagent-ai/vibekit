/**
 * Phase 4: API Gateway & External Integration
 * 
 * This service provides REST and WebSocket APIs for external access to telemetry data,
 * with authentication, rate limiting, and real-time streaming capabilities.
 */

import { EventEmitter } from 'events';
import { DrizzleTelemetryOperations, TelemetryQueryFilter, SessionQueryFilter } from '../db';
import { AdvancedAnalyticsService, AnalyticsMetrics } from './advanced-analytics';

export interface ApiConfig {
  port?: number;
  enableAuth?: boolean;
  apiKeys?: string[];
  rateLimitConfig?: {
    windowMs: number;
    maxRequests: number;
  };
  corsConfig?: {
    origins: string[];
    credentials: boolean;
  };
  enableWebSocket?: boolean;
  enableSwagger?: boolean;
}

export interface ApiRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  timestamp: number;
  apiKey?: string;
  clientId?: string;
}

export interface ApiResponse {
  status: number;
  data?: any;
  error?: string;
  timestamp: number;
  processingTime: number;
  requestId: string;
}

export interface WebSocketClient {
  id: string;
  connected: boolean;
  subscriptions: string[];
  lastActivity: number;
  metadata?: Record<string, any>;
}

export interface RateLimitStatus {
  remaining: number;
  resetTime: number;
  limit: number;
  exceeded: boolean;
}

export class TelemetryApiGateway extends EventEmitter {
  private operations: DrizzleTelemetryOperations;
  private analytics?: AdvancedAnalyticsService;
  private config: Required<ApiConfig>;
  private rateLimitMap: Map<string, { count: number; resetTime: number }>;
  private wsClients: Map<string, WebSocketClient>;
  private isRunning = false;

  constructor(
    operations: DrizzleTelemetryOperations,
    analytics?: AdvancedAnalyticsService,
    config: ApiConfig = {}
  ) {
    super();
    this.operations = operations;
    this.analytics = analytics;
    this.rateLimitMap = new Map();
    this.wsClients = new Map();

    this.config = {
      port: config.port || 8080,
      enableAuth: config.enableAuth ?? true,
      apiKeys: config.apiKeys || ['default-api-key'],
      rateLimitConfig: config.rateLimitConfig || {
        windowMs: 60000, // 1 minute
        maxRequests: 100,
      },
      corsConfig: config.corsConfig || {
        origins: ['*'],
        credentials: false,
      },
      enableWebSocket: config.enableWebSocket ?? true,
      enableSwagger: config.enableSwagger ?? true,
    };
  }

  /**
   * Start the API gateway server
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // Initialize rate limiting cleanup
    this.startRateLimitCleanup();
    
    // Set up analytics event listeners if available
    if (this.analytics) {
      this.setupAnalyticsListeners();
    }

    this.emit('server_started', { port: this.config.port });
  }

  /**
   * Stop the API gateway server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    // Close all WebSocket connections
    for (const client of this.wsClients.values()) {
      this.disconnectClient(client.id);
    }

    this.emit('server_stopped');
  }

  /**
   * Handle incoming API requests
   */
  async handleApiRequest(request: ApiRequest): Promise<ApiResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // Authentication check
      if (this.config.enableAuth && !this.isValidApiKey(request.apiKey)) {
        return this.createErrorResponse(401, 'Invalid API key', requestId, startTime);
      }

      // Rate limiting check
      const rateLimitStatus = this.checkRateLimit(request.apiKey || request.clientId || 'anonymous');
      if (rateLimitStatus.exceeded) {
        return this.createErrorResponse(429, 'Rate limit exceeded', requestId, startTime, {
          rateLimitStatus,
        });
      }

      // Route the request
      const response = await this.routeRequest(request);
      
      this.emit('api_request', {
        request,
        response,
        processingTime: Date.now() - startTime,
      });

      return {
        ...response,
        requestId,
        processingTime: Date.now() - startTime,
        timestamp: Date.now(),
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      return this.createErrorResponse(500, errorMessage, requestId, startTime);
    }
  }

  /**
   * Handle WebSocket connections
   */
  connectWebSocketClient(clientId: string, metadata?: Record<string, any>): void {
    if (!this.config.enableWebSocket) return;

    const client: WebSocketClient = {
      id: clientId,
      connected: true,
      subscriptions: [],
      lastActivity: Date.now(),
      metadata,
    };

    this.wsClients.set(clientId, client);
    this.emit('ws_client_connected', client);
  }

  /**
   * Handle WebSocket disconnections
   */
  disconnectClient(clientId: string): void {
    const client = this.wsClients.get(clientId);
    if (client) {
      client.connected = false;
      this.wsClients.delete(clientId);
      this.emit('ws_client_disconnected', client);
    }
  }

  /**
   * Subscribe client to real-time updates
   */
  subscribeClient(clientId: string, subscription: string): boolean {
    const client = this.wsClients.get(clientId);
    if (!client || !client.connected) return false;

    if (!client.subscriptions.includes(subscription)) {
      client.subscriptions.push(subscription);
      client.lastActivity = Date.now();
    }

    this.emit('ws_subscription_added', { clientId, subscription });
    return true;
  }

  /**
   * Unsubscribe client from updates
   */
  unsubscribeClient(clientId: string, subscription: string): boolean {
    const client = this.wsClients.get(clientId);
    if (!client) return false;

    const index = client.subscriptions.indexOf(subscription);
    if (index > -1) {
      client.subscriptions.splice(index, 1);
      client.lastActivity = Date.now();
    }

    this.emit('ws_subscription_removed', { clientId, subscription });
    return true;
  }

  /**
   * Broadcast data to subscribed clients
   */
  broadcast(subscription: string, data: any): void {
    if (!this.config.enableWebSocket) return;

    const message = {
      type: 'data',
      subscription,
      data,
      timestamp: Date.now(),
    };

    let sentCount = 0;
    for (const client of this.wsClients.values()) {
      if (client.connected && client.subscriptions.includes(subscription)) {
        this.emit('ws_message', { clientId: client.id, message });
        sentCount++;
      }
    }

    this.emit('broadcast_sent', { subscription, sentCount, dataSize: JSON.stringify(data).length });
  }

  /**
   * Get API documentation/schema
   */
  getApiDocumentation(): any {
    return {
      openapi: '3.0.0',
      info: {
        title: 'VibeKit Telemetry API',
        version: '1.0.0',
        description: 'REST API for accessing VibeKit telemetry data and analytics',
      },
      servers: [
        {
          url: `http://localhost:${this.config.port}`,
          description: 'Local development server',
        },
      ],
      security: [
        {
          ApiKeyAuth: [],
        },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
      paths: {
        '/api/v1/events': {
          get: {
            summary: 'Query telemetry events',
            parameters: [
              { name: 'from', in: 'query', schema: { type: 'integer' } },
              { name: 'to', in: 'query', schema: { type: 'integer' } },
              { name: 'sessionId', in: 'query', schema: { type: 'string' } },
              { name: 'agentType', in: 'query', schema: { type: 'string' } },
              { name: 'eventType', in: 'query', schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 1000 } },
            ],
            responses: {
              200: { description: 'List of telemetry events' },
              401: { description: 'Unauthorized' },
              429: { description: 'Rate limit exceeded' },
            },
          },
        },
        '/api/v1/sessions': {
          get: {
            summary: 'Query telemetry sessions',
            parameters: [
              { name: 'from', in: 'query', schema: { type: 'integer' } },
              { name: 'to', in: 'query', schema: { type: 'integer' } },
              { name: 'agentType', in: 'query', schema: { type: 'string' } },
              { name: 'status', in: 'query', schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 1000 } },
            ],
            responses: {
              200: { description: 'List of telemetry sessions' },
            },
          },
        },
        '/api/v1/analytics': {
          get: {
            summary: 'Get comprehensive analytics',
            parameters: [
              { name: 'from', in: 'query', schema: { type: 'integer' } },
              { name: 'to', in: 'query', schema: { type: 'integer' } },
            ],
            responses: {
              200: { description: 'Analytics metrics and insights' },
            },
          },
        },
        '/api/v1/statistics': {
          get: {
            summary: 'Get basic statistics',
            responses: {
              200: { description: 'Basic telemetry statistics' },
            },
          },
        },
      },
    };
  }

  /**
   * Get current API status and health
   */
  getApiStatus(): {
    status: string;
    uptime: number;
    connections: {
      total: number;
      active: number;
    };
    rateLimit: {
      activeClients: number;
      totalRequests: number;
    };
    version: string;
  } {
    return {
      status: this.isRunning ? 'running' : 'stopped',
      uptime: Date.now() - (this as any).startTime || 0,
      connections: {
        total: this.wsClients.size,
        active: Array.from(this.wsClients.values()).filter(c => c.connected).length,
      },
      rateLimit: {
        activeClients: this.rateLimitMap.size,
        totalRequests: Array.from(this.rateLimitMap.values()).reduce((sum, r) => sum + r.count, 0),
      },
      version: '1.0.0',
    };
  }

  // Private methods

  private async routeRequest(request: ApiRequest): Promise<Omit<ApiResponse, 'requestId' | 'processingTime' | 'timestamp'>> {
    const { path, method, query } = request;

    // Parse query parameters
    const parseIntOrUndefined = (value: string | undefined) => 
      value ? parseInt(value, 10) : undefined;

    switch (true) {
      case path === '/api/v1/events' && method === 'GET':
        const eventFilter: TelemetryQueryFilter = {
          from: parseIntOrUndefined(query.from),
          to: parseIntOrUndefined(query.to),
          sessionId: query.sessionId,
          agentType: query.agentType,
          eventType: query.eventType as any,
          limit: Math.min(parseIntOrUndefined(query.limit) || 100, 1000),
        };
        const events = await this.operations.queryEvents(eventFilter);
        return { status: 200, data: { events, count: events.length } };

      case path === '/api/v1/sessions' && method === 'GET':
        const sessionFilter: SessionQueryFilter = {
          from: parseIntOrUndefined(query.from),
          to: parseIntOrUndefined(query.to),
          agentType: query.agentType,
          status: query.status as any,
          limit: Math.min(parseIntOrUndefined(query.limit) || 100, 1000),
        };
        const sessions = await this.operations.querySessions(sessionFilter);
        return { status: 200, data: { sessions, count: sessions.length } };

      case path === '/api/v1/analytics' && method === 'GET':
        if (!this.analytics) {
          return { status: 503, error: 'Analytics service not available' };
        }
        const timeRange = query.from && query.to ? {
          from: parseInt(query.from, 10),
          to: parseInt(query.to, 10),
        } : undefined;
        const analytics = await this.analytics.getAnalytics(timeRange);
        return { status: 200, data: analytics };

      case path === '/api/v1/statistics' && method === 'GET':
        const stats = await this.operations.getStatistics();
        return { status: 200, data: stats };

      case path === '/api/v1/health' && method === 'GET':
        return { status: 200, data: this.getApiStatus() };

      case path === '/api/v1/docs' && method === 'GET':
        if (!this.config.enableSwagger) {
          return { status: 404, error: 'API documentation not enabled' };
        }
        return { status: 200, data: this.getApiDocumentation() };

      default:
        return { status: 404, error: 'Endpoint not found' };
    }
  }

  private isValidApiKey(apiKey?: string): boolean {
    if (!this.config.enableAuth) return true;
    return apiKey ? this.config.apiKeys.includes(apiKey) : false;
  }

  private checkRateLimit(clientId: string): RateLimitStatus {
    const now = Date.now();
    const windowMs = this.config.rateLimitConfig.windowMs;
    const maxRequests = this.config.rateLimitConfig.maxRequests;

    let clientLimits = this.rateLimitMap.get(clientId);
    
    if (!clientLimits || now > clientLimits.resetTime) {
      clientLimits = {
        count: 0,
        resetTime: now + windowMs,
      };
      this.rateLimitMap.set(clientId, clientLimits);
    }

    clientLimits.count++;

    return {
      remaining: Math.max(0, maxRequests - clientLimits.count),
      resetTime: clientLimits.resetTime,
      limit: maxRequests,
      exceeded: clientLimits.count > maxRequests,
    };
  }

  private createErrorResponse(
    status: number,
    error: string,
    requestId: string,
    startTime: number,
    additionalData?: any
  ): ApiResponse {
    return {
      status,
      error,
      requestId,
      processingTime: Date.now() - startTime,
      timestamp: Date.now(),
      data: additionalData,
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startRateLimitCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [clientId, limits] of this.rateLimitMap.entries()) {
        if (now > limits.resetTime) {
          this.rateLimitMap.delete(clientId);
        }
      }
    }, this.config.rateLimitConfig.windowMs);
  }

  private setupAnalyticsListeners(): void {
    if (!this.analytics) return;

    this.analytics.on('alert', (alert) => {
      this.broadcast('alerts', { type: 'new_alert', alert });
    });

    this.analytics.on('anomalies_detected', (anomalies) => {
      this.broadcast('anomalies', { type: 'anomalies_detected', anomalies });
    });

    this.analytics.on('monitoring_cycle_complete', () => {
      // Broadcast updated metrics to subscribers
      this.analytics!.getAnalytics().then(analytics => {
        this.broadcast('metrics', { type: 'metrics_update', analytics });
      }).catch(error => {
        console.warn('Failed to broadcast analytics update:', error);
      });
    });
  }
}

/**
 * Create a simple HTTP-like server simulation for testing
 */
export class TelemetryApiServer {
  private gateway: TelemetryApiGateway;
  private requestLog: ApiRequest[] = [];

  constructor(gateway: TelemetryApiGateway) {
    this.gateway = gateway;
  }

  /**
   * Simulate an HTTP request
   */
  async request(
    method: string,
    path: string,
    options: {
      query?: Record<string, string>;
      headers?: Record<string, string>;
      body?: any;
      apiKey?: string;
    } = {}
  ): Promise<ApiResponse> {
    const request: ApiRequest = {
      path,
      method: method.toUpperCase(),
      headers: options.headers || {},
      query: options.query || {},
      body: options.body,
      timestamp: Date.now(),
      apiKey: options.apiKey || options.headers?.['X-API-Key'],
      clientId: `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    };

    this.requestLog.push(request);
    
    // Keep only last 1000 requests
    if (this.requestLog.length > 1000) {
      this.requestLog.shift();
    }

    return this.gateway.handleApiRequest(request);
  }

  /**
   * Get request history for debugging
   */
  getRequestLog(): ApiRequest[] {
    return [...this.requestLog];
  }

  /**
   * Clear request log
   */
  clearRequestLog(): void {
    this.requestLog = [];
  }
} 