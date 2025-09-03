/**
 * Webhook Utilities
 * 
 * Utility functions for webhook validation, filtering, and testing.
 */

import crypto from 'crypto';
import { GitHubWebhookEvent } from '../core/github-sync-engine';

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
  eventType?: string;
  action?: string;
}

export interface WebhookEventFilter {
  eventTypes?: string[];
  actions?: string[];
  repositories?: string[];
  senders?: string[];
  labelFilters?: {
    include?: string[];
    exclude?: string[];
  };
}

/**
 * Utility class for webhook operations
 */
export class WebhookUtils {
  /**
   * Validate GitHub webhook signature
   */
  static validateGitHubSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean {
    if (!signature || !secret) {
      return false;
    }

    const expectedSignature = 'sha256=' + 
      crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Parse and validate GitHub webhook payload
   */
  static parseGitHubWebhook(
    payload: string | Buffer,
    headers: Record<string, string>
  ): WebhookValidationResult {
    try {
      const eventType = headers['x-github-event'];
      if (!eventType) {
        return { valid: false, error: 'Missing X-GitHub-Event header' };
      }

      const parsedPayload = typeof payload === 'string' ? 
        JSON.parse(payload) : 
        JSON.parse(payload.toString());

      if (!parsedPayload.action && !this.isValidEventWithoutAction(eventType)) {
        return { valid: false, error: 'Missing action field in payload' };
      }

      return {
        valid: true,
        eventType,
        action: parsedPayload.action || 'default'
      };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Invalid JSON payload' 
      };
    }
  }

  /**
   * Filter webhook events based on criteria
   */
  static shouldProcessEvent(
    event: GitHubWebhookEvent,
    filter: WebhookEventFilter
  ): boolean {
    // Filter by event types
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      // This would need the actual event type from headers
      // For now, we'll use a heuristic based on the event structure
      const eventType = this.inferEventType(event);
      if (!filter.eventTypes.includes(eventType)) {
        return false;
      }
    }

    // Filter by actions
    if (filter.actions && filter.actions.length > 0) {
      if (!filter.actions.includes(event.action)) {
        return false;
      }
    }

    // Filter by repositories
    if (filter.repositories && filter.repositories.length > 0) {
      if (!filter.repositories.includes(event.repository.full_name)) {
        return false;
      }
    }

    // Filter by senders
    if (filter.senders && filter.senders.length > 0) {
      if (!filter.senders.includes(event.sender.login)) {
        return false;
      }
    }

    // Filter by labels
    if (filter.labelFilters && event.label) {
      const labelName = event.label.name;
      
      // Exclude specific labels
      if (filter.labelFilters.exclude && 
          filter.labelFilters.exclude.includes(labelName)) {
        return false;
      }
      
      // Include only specific labels
      if (filter.labelFilters.include && 
          filter.labelFilters.include.length > 0 &&
          !filter.labelFilters.include.includes(labelName)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate webhook test payload for development
   */
  static generateTestPayload(
    eventType: string,
    action: string,
    repository: string,
    options: {
      issueNumber?: number;
      prNumber?: number;
      title?: string;
      sender?: string;
      labelName?: string;
    } = {}
  ): { payload: any; headers: Record<string, string> } {
    const basePayload = {
      action,
      repository: {
        full_name: repository,
        name: repository.split('/')[1],
        owner: { login: repository.split('/')[0] }
      },
      sender: {
        login: options.sender || 'test-user',
        id: 123456
      }
    };

    let payload = { ...basePayload };

    switch (eventType) {
      case 'issues':
        payload = {
          ...basePayload,
          issue: {
            number: options.issueNumber || 123,
            title: options.title || 'Test Issue',
            body: 'This is a test issue',
            state: 'open',
            labels: [],
            assignees: [],
            html_url: `https://github.com/${repository}/issues/${options.issueNumber || 123}`
          }
        };
        
        if (options.labelName && (action === 'labeled' || action === 'unlabeled')) {
          payload.label = {
            name: options.labelName,
            color: '0052cc'
          };
        }
        break;

      case 'pull_request':
        payload = {
          ...basePayload,
          pull_request: {
            number: options.prNumber || 123,
            title: options.title || 'Test Pull Request',
            body: 'This is a test pull request',
            state: 'open',
            merged: action === 'closed',
            base: { ref: 'main' },
            head: { 
              ref: 'feature-branch',
              sha: 'abc123def456'
            },
            html_url: `https://github.com/${repository}/pull/${options.prNumber || 123}`
          }
        };
        break;

      case 'push':
        payload = {
          ...basePayload,
          ref: 'refs/heads/main',
          commits: [
            {
              id: 'abc123def456',
              message: 'Test commit',
              author: { name: 'Test User', email: 'test@example.com' }
            }
          ]
        };
        break;
    }

    const headers = {
      'x-github-event': eventType,
      'x-github-delivery': this.generateDeliveryId(),
      'content-type': 'application/json',
      'user-agent': 'GitHub-Hookshot/webhook-test'
    };

    return { payload, headers };
  }

  /**
   * Generate webhook signature for testing
   */
  static generateTestSignature(payload: string | Buffer, secret: string): string {
    return 'sha256=' + 
      crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
  }

  /**
   * Validate webhook server health
   */
  static async validateWebhookEndpoint(
    url: string,
    secret: string,
    timeout: number = 5000
  ): Promise<{
    reachable: boolean;
    responseTime?: number;
    statusCode?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // Generate test payload
      const testPayload = JSON.stringify({
        action: 'ping',
        zen: 'Keep it simple.',
        repository: { full_name: 'test/test' },
        sender: { login: 'test' }
      });

      const signature = this.generateTestSignature(testPayload, secret);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping',
          'X-GitHub-Delivery': this.generateDeliveryId(),
          'X-Hub-Signature-256': signature,
          'User-Agent': 'GitHub-Hookshot/webhook-test'
        },
        body: testPayload,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        reachable: true,
        responseTime,
        statusCode: response.status
      };
    } catch (error: any) {
      return {
        reachable: false,
        responseTime: Date.now() - startTime,
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Extract issue/PR references from commit messages
   */
  static extractReferences(message: string): {
    issues: number[];
    pullRequests: number[];
    keywords: Array<{ type: 'closes' | 'fixes' | 'resolves'; number: number }>;
  } {
    const issues: number[] = [];
    const pullRequests: number[] = [];
    const keywords: Array<{ type: 'closes' | 'fixes' | 'resolves'; number: number }> = [];

    // Match issue/PR references
    const issueMatches = message.match(/#(\d+)/g);
    if (issueMatches) {
      for (const match of issueMatches) {
        const number = parseInt(match.substring(1));
        issues.push(number);
      }
    }

    // Match closing keywords
    const closingPatterns = [
      /(?:closes?|closed|close)\s+#(\d+)/gi,
      /(?:fixes?|fixed|fix)\s+#(\d+)/gi,
      /(?:resolves?|resolved|resolve)\s+#(\d+)/gi
    ];

    for (const pattern of closingPatterns) {
      const matches = [...message.matchAll(pattern)];
      for (const match of matches) {
        const number = parseInt(match[1]);
        const type = match[0].toLowerCase().includes('close') ? 'closes' :
                    match[0].toLowerCase().includes('fix') ? 'fixes' : 'resolves';
        keywords.push({ type, number });
      }
    }

    return { issues, pullRequests, keywords };
  }

  /**
   * Check if an event type is valid without an action field
   */
  private static isValidEventWithoutAction(eventType: string): boolean {
    const eventsWithoutAction = ['push', 'create', 'delete', 'fork', 'watch', 'star'];
    return eventsWithoutAction.includes(eventType);
  }

  /**
   * Infer event type from webhook event structure
   */
  private static inferEventType(event: GitHubWebhookEvent): string {
    if (event.issue) return 'issues';
    if (event.pull_request) return 'pull_request';
    return 'unknown';
  }

  /**
   * Generate unique delivery ID
   */
  private static generateDeliveryId(): string {
    return crypto.randomUUID();
  }
}

/**
 * Webhook event filter presets
 */
export const WebhookFilters = {
  /**
   * Only process task-relevant events
   */
  taskRelevant: (): WebhookEventFilter => ({
    eventTypes: ['issues', 'pull_request'],
    actions: [
      'opened', 'closed', 'reopened', 'edited',
      'labeled', 'unlabeled', 'assigned', 'unassigned',
      'milestoned', 'demilestoned'
    ]
  }),

  /**
   * Only process PR merge events
   */
  prMergeOnly: (): WebhookEventFilter => ({
    eventTypes: ['pull_request'],
    actions: ['closed']
  }),

  /**
   * Only process label changes
   */
  labelsOnly: (): WebhookEventFilter => ({
    eventTypes: ['issues', 'pull_request'],
    actions: ['labeled', 'unlabeled']
  }),

  /**
   * Exclude bot activity
   */
  noBots: (): WebhookEventFilter => ({
    senders: ['dependabot[bot]', 'github-actions[bot]'].map(bot => `!${bot}`)
  }),

  /**
   * Only auto-merge related labels
   */
  autoMergeLabels: (): WebhookEventFilter => ({
    eventTypes: ['pull_request'],
    actions: ['labeled'],
    labelFilters: {
      include: ['auto-merge', 'ready-to-merge', 'safe-to-merge']
    }
  })
};