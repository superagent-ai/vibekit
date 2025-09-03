/**
 * GitHub Webhook Server
 * 
 * Optional webhook server for real-time bidirectional synchronization
 * between GitHub and task management systems. Handles incoming GitHub
 * webhook events and processes them through the sync engine.
 */

import { createServer, Server } from 'http';
import { EventEmitter } from 'events';
import express, { Express, Request, Response } from 'express';
import crypto from 'crypto';
import { GitHubSyncEngine, GitHubWebhookEvent } from '../core/github-sync-engine';
import { GitHubIntegrationManager } from '../core/github-integration-manager';
import { PRMergeManager } from '../core/pr-merge-manager';
import { JSONLEventStore } from '../storage/jsonl-event-store';

export interface GitHubWebhookConfig {
  port: number;
  secret: string;
  path?: string; // Webhook endpoint path, default: '/webhooks/github'
  github: {
    token: string;
    repository: string;
  };
  rateLimit?: {
    windowMs: number; // Rate limiting window in milliseconds
    maxRequests: number; // Maximum requests per window
  };
  security?: {
    allowedIPs?: string[]; // Restrict access to specific IPs
    requireHttps?: boolean; // Require HTTPS in production
  };
}

export interface WebhookServerEvents {
  webhookReceived: (event: GitHubWebhookEvent, headers: Record<string, string>) => void;
  webhookProcessed: (event: GitHubWebhookEvent, result: any) => void;
  webhookError: (error: Error, event?: GitHubWebhookEvent) => void;
  serverStarted: (port: number) => void;
  serverStopped: () => void;
  securityViolation: (ip: string, reason: string) => void;
  rateLimited: (ip: string) => void;
}

interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Webhook server for processing GitHub webhook events
 */
export class GitHubWebhookServer extends EventEmitter<WebhookServerEvents> {
  private app: Express;
  private server?: Server;
  private config: GitHubWebhookConfig;
  private syncEngine?: GitHubSyncEngine;
  private integrationManager?: GitHubIntegrationManager;
  private prMergeManager?: PRMergeManager;
  private eventStore = new JSONLEventStore();
  private isRunning = false;
  
  // Rate limiting tracking
  private rateLimitMap = new Map<string, { requests: number; resetTime: number }>();

  constructor(config: GitHubWebhookConfig) {
    super();
    this.config = config;
    this.app = express();
    
    this.validateConfig();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set the sync engine for processing webhook events
   */
  setSyncEngine(syncEngine: GitHubSyncEngine): void {
    this.syncEngine = syncEngine;
  }

  /**
   * Set the integration manager for additional GitHub operations
   */
  setIntegrationManager(integrationManager: GitHubIntegrationManager): void {
    this.integrationManager = integrationManager;
  }

  /**
   * Set the PR merge manager for automated merging
   */
  setPRMergeManager(prMergeManager: PRMergeManager): void {
    this.prMergeManager = prMergeManager;
  }

  /**
   * Start the webhook server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Webhook server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        this.isRunning = true;
        this.emit('serverStarted', this.config.port);
        
        this.logEvent('webhook.server.started', {
          port: this.config.port,
          path: this.config.path || '/webhooks/github',
          repository: this.config.github.repository
        });

        resolve();
      });

      this.server.on('error', (error) => {
        this.emit('webhookError', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        this.isRunning = false;
        this.server = undefined;
        this.emit('serverStopped');
        
        this.logEvent('webhook.server.stopped', {});
        resolve();
      });
    });
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    port?: number;
    uptime?: number;
    webhooksReceived?: number;
    rateLimitedRequests?: number;
  } {
    return {
      running: this.isRunning,
      port: this.isRunning ? this.config.port : undefined,
      // Additional metrics would be tracked here
    };
  }

  /**
   * Validate webhook server configuration
   */
  private validateConfig(): void {
    if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
      throw new Error('Invalid port number. Must be between 1 and 65535.');
    }

    if (!this.config.secret) {
      throw new Error('Webhook secret is required for security.');
    }

    if (!this.config.github.token) {
      throw new Error('GitHub token is required for webhook server.');
    }

    if (!this.config.github.repository) {
      throw new Error('GitHub repository is required for webhook server.');
    }

    if (this.config.security?.requireHttps && process.env.NODE_ENV === 'production') {
      console.warn('HTTPS is required in production but not enforced at application level. Configure reverse proxy accordingly.');
    }
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    // Raw body parser for webhook signature verification
    this.app.use(
      this.config.path || '/webhooks/github',
      express.raw({ type: 'application/json', limit: '1mb' }),
      (req: WebhookRequest, res, next) => {
        req.rawBody = req.body;
        next();
      }
    );

    // JSON parser for other routes
    this.app.use(express.json());

    // Security middleware
    this.app.use((req, res, next) => {
      // IP filtering if configured
      if (this.config.security?.allowedIPs) {
        const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
        if (!this.config.security.allowedIPs.includes(clientIP)) {
          this.emit('securityViolation', clientIP, 'IP not in allowed list');
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      // Rate limiting if configured
      if (this.config.rateLimit) {
        const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
        if (!this.checkRateLimit(clientIP)) {
          this.emit('rateLimited', clientIP);
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }
      }

      next();
    });
  }

  /**
   * Set up webhook routes
   */
  private setupRoutes(): void {
    const webhookPath = this.config.path || '/webhooks/github';

    // Main webhook endpoint
    this.app.post(webhookPath, async (req: WebhookRequest, res: Response) => {
      try {
        // Verify webhook signature
        if (!this.verifyWebhookSignature(req)) {
          this.emit('securityViolation', req.ip || 'unknown', 'Invalid webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }

        // Parse webhook event
        const event = this.parseWebhookEvent(req);
        if (!event) {
          return res.status(400).json({ error: 'Invalid webhook payload' });
        }

        this.emit('webhookReceived', event, req.headers as Record<string, string>);

        // Process the webhook event
        const result = await this.processWebhookEvent(event, req.headers as Record<string, string>);
        
        this.emit('webhookProcessed', event, result);

        // Respond to GitHub
        res.status(200).json({ 
          status: 'success', 
          processed: true,
          eventId: result?.eventId 
        });

      } catch (error) {
        const webhookError = error instanceof Error ? error : new Error(String(error));
        this.emit('webhookError', webhookError);

        await this.logEvent('webhook.processing.error', {
          error: webhookError.message,
          headers: req.headers,
          body: req.rawBody?.toString().substring(0, 1000) // First 1KB for debugging
        });

        res.status(500).json({ 
          error: 'Internal server error',
          message: webhookError.message
        });
      }
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        server: 'webhook-server',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Status endpoint
    this.app.get('/status', (req, res) => {
      res.json(this.getStatus());
    });
  }

  /**
   * Verify GitHub webhook signature using HMAC-SHA256
   */
  private verifyWebhookSignature(req: WebhookRequest): boolean {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature || !req.rawBody) {
      return false;
    }

    const expectedSignature = 'sha256=' + 
      crypto
        .createHmac('sha256', this.config.secret)
        .update(req.rawBody)
        .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Parse GitHub webhook event from request
   */
  private parseWebhookEvent(req: WebhookRequest): GitHubWebhookEvent | null {
    try {
      const eventType = req.headers['x-github-event'] as string;
      if (!eventType) {
        return null;
      }

      const payload = JSON.parse(req.rawBody?.toString() || '{}');

      // Convert GitHub webhook payload to our event format
      return {
        action: payload.action || 'unknown',
        number: payload.number || payload.issue?.number || payload.pull_request?.number,
        issue: payload.issue,
        pull_request: payload.pull_request,
        label: payload.label,
        assignee: payload.assignee,
        milestone: payload.milestone,
        repository: payload.repository,
        sender: payload.sender
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Process webhook event through sync engine
   */
  private async processWebhookEvent(
    event: GitHubWebhookEvent, 
    headers: Record<string, string>
  ): Promise<any> {
    const eventId = this.generateEventId();

    await this.logEvent('webhook.event.received', {
      eventId,
      eventType: headers['x-github-event'],
      action: event.action,
      repository: event.repository.full_name,
      number: event.number,
      sender: event.sender.login
    });

    // Process through sync engine if available
    if (this.syncEngine) {
      try {
        await this.syncEngine.onGitHubWebhookReceived(event);
      } catch (error) {
        await this.logEvent('webhook.sync.error', {
          eventId,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }

    // Handle specific event types for additional processing
    await this.handleSpecificEventTypes(event, eventId);

    return { eventId, processed: true };
  }

  /**
   * Handle specific GitHub event types
   */
  private async handleSpecificEventTypes(event: GitHubWebhookEvent, eventId: string): Promise<void> {
    const eventType = event.action;

    switch (eventType) {
      case 'opened':
        if (event.pull_request) {
          await this.handlePullRequestOpened(event, eventId);
        }
        break;
        
      case 'closed':
        if (event.pull_request && event.pull_request.merged) {
          await this.handlePullRequestMerged(event, eventId);
        }
        break;

      case 'synchronize':
        if (event.pull_request) {
          await this.handlePullRequestSynchronized(event, eventId);
        }
        break;

      case 'labeled':
      case 'unlabeled':
        await this.handleLabelChanged(event, eventId);
        break;
    }
  }

  /**
   * Handle pull request opened event
   */
  private async handlePullRequestOpened(event: GitHubWebhookEvent, eventId: string): Promise<void> {
    if (!event.pull_request) return;

    await this.logEvent('webhook.pr.opened', {
      eventId,
      prNumber: event.pull_request.number,
      title: event.pull_request.title,
      author: event.sender.login
    });

    // Check if this PR should be auto-merged
    if (this.prMergeManager) {
      try {
        // Don't auto-merge immediately, let CI run first
        console.log(`PR #${event.pull_request.number} opened, will check for auto-merge after CI completes`);
      } catch (error) {
        await this.logEvent('webhook.pr.auto_merge_error', {
          eventId,
          prNumber: event.pull_request.number,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Handle pull request merged event
   */
  private async handlePullRequestMerged(event: GitHubWebhookEvent, eventId: string): Promise<void> {
    if (!event.pull_request) return;

    await this.logEvent('webhook.pr.merged', {
      eventId,
      prNumber: event.pull_request.number,
      title: event.pull_request.title,
      mergeCommitSha: event.pull_request.merge_commit_sha
    });

    // This would trigger task completion in the PM tool
    // The sync engine should handle this through the normal sync process
  }

  /**
   * Handle pull request synchronized (updated) event
   */
  private async handlePullRequestSynchronized(event: GitHubWebhookEvent, eventId: string): Promise<void> {
    if (!event.pull_request) return;

    await this.logEvent('webhook.pr.synchronized', {
      eventId,
      prNumber: event.pull_request.number,
      headSha: event.pull_request.head?.sha
    });

    // This would trigger a check for auto-merge once CI completes
    // if (this.prMergeManager) {
    //   // Schedule auto-merge check after a delay to let CI start
    //   setTimeout(async () => {
    //     try {
    //       await this.prMergeManager!.attemptAutoMerge(event.pull_request!.number);
    //     } catch (error) {
    //       console.warn(`Auto-merge failed for PR #${event.pull_request!.number}:`, error);
    //     }
    //   }, 60000); // Wait 1 minute for CI to start
    // }
  }

  /**
   * Handle label changed events
   */
  private async handleLabelChanged(event: GitHubWebhookEvent, eventId: string): Promise<void> {
    if (!event.label) return;

    await this.logEvent('webhook.label.changed', {
      eventId,
      action: event.action,
      labelName: event.label.name,
      number: event.number,
      type: event.issue ? 'issue' : (event.pull_request ? 'pull_request' : 'unknown')
    });

    // Check for auto-merge labels on PRs
    if (event.pull_request && this.prMergeManager && event.action === 'labeled') {
      const autoMergeLabels = ['auto-merge', 'ready-to-merge'];
      if (autoMergeLabels.includes(event.label.name)) {
        try {
          await this.prMergeManager.attemptAutoMerge(event.pull_request.number);
        } catch (error) {
          await this.logEvent('webhook.auto_merge.error', {
            eventId,
            prNumber: event.pull_request.number,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  /**
   * Check rate limiting for client IP
   */
  private checkRateLimit(clientIP: string): boolean {
    if (!this.config.rateLimit) return true;

    const now = Date.now();
    const windowMs = this.config.rateLimit.windowMs;
    const maxRequests = this.config.rateLimit.maxRequests;

    const current = this.rateLimitMap.get(clientIP);
    
    if (!current || now > current.resetTime) {
      // First request or window expired
      this.rateLimitMap.set(clientIP, {
        requests: 1,
        resetTime: now + windowMs
      });
      return true;
    }

    if (current.requests >= maxRequests) {
      return false;
    }

    current.requests++;
    return true;
  }

  /**
   * Log webhook events
   */
  private async logEvent(type: string, data: any): Promise<void> {
    try {
      await this.eventStore.appendEvent('github-webhooks', {
        id: this.generateEventId(),
        type,
        timestamp: new Date().toISOString(),
        data
      });
    } catch (error) {
      console.error('Failed to log webhook event:', error);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Webhook server configuration presets
 */
export const WebhookServerPresets = {
  /**
   * Development configuration
   */
  development: (config: Partial<GitHubWebhookConfig>): GitHubWebhookConfig => ({
    port: 3001,
    secret: 'dev-webhook-secret',
    path: '/webhooks/github',
    rateLimit: {
      windowMs: 60000, // 1 minute
      maxRequests: 100
    },
    ...config,
    github: {
      token: process.env.GITHUB_TOKEN!,
      repository: process.env.GITHUB_REPOSITORY!,
      ...config.github
    }
  }),

  /**
   * Production configuration
   */
  production: (config: Partial<GitHubWebhookConfig>): GitHubWebhookConfig => ({
    port: 443,
    secret: process.env.VIBEKIT_WEBHOOK_SECRET!,
    path: '/webhooks/github',
    rateLimit: {
      windowMs: 60000, // 1 minute
      maxRequests: 60   // Conservative limit
    },
    security: {
      requireHttps: true,
      // GitHub webhook IPs would be configured here
    },
    ...config,
    github: {
      token: process.env.GITHUB_TOKEN!,
      repository: process.env.GITHUB_REPOSITORY!,
      ...config.github
    }
  }),

  /**
   * Testing configuration
   */
  testing: (config: Partial<GitHubWebhookConfig>): GitHubWebhookConfig => ({
    port: 0, // Random available port
    secret: 'test-webhook-secret',
    path: '/webhooks/github',
    ...config,
    github: {
      token: 'test-token',
      repository: 'test-org/test-repo',
      ...config.github
    }
  })
};