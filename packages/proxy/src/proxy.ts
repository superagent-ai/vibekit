import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import pino from 'pino'
import { SecretRedactor } from './redactor.js'
import { ConfigLoader } from './config.js'
import { redactionMiddleware, createSecureLogger } from './middleware.js'
import { ProxyConfig } from './types.js'

export class LLMProxy {
  private app: Hono
  private redactor: SecretRedactor
  private configLoader: ConfigLoader
  private logger: pino.Logger
  private target: string

  constructor(config: ProxyConfig) {
    this.target = config.target
    this.logger = createSecureLogger(config.logLevel)
    this.app = new Hono()
    
    // Initialize config loader and redactor
    this.configLoader = new ConfigLoader(config.configPath, this.logger)
    const initialRules = this.configLoader.loadConfig()
    this.redactor = new SecretRedactor(initialRules)

    // Setup hot reload
    this.configLoader.setupHotReload((newRules) => {
      this.redactor.updateRules(newRules)
    })

    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use('*', cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }))

    // Request logging
    this.app.use('*', honoLogger())

    // Redaction middleware for all routes except health check
    this.app.use('*', async (c, next) => {
      if (c.req.path === '/healthz' || c.req.path.startsWith('/v1/')) {
        return next()
      }
      return redactionMiddleware({ 
        redactor: this.redactor, 
        logger: this.logger 
      })(c, next)
    })
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/healthz', (c) => {
      const metrics = this.redactor.getMetrics()
      const recentRedactions = this.redactor.getRecentRedactions(5)
      
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics: {
          ...metrics,
          recentRedactionsCount: recentRedactions.length
        }
      })
    })

    // Audit endpoint (for internal monitoring)
    this.app.get('/internal/audit', (c) => {
      const auditLog = this.redactor.getAuditLog()
      return c.json({
        auditLog: auditLog.map(entry => ({
          timestamp: entry.timestamp,
          secretKeyName: entry.secretKeyName,
          responseId: entry.responseId,
          redactionType: entry.redactionType
        }))
      })
    })

    // Proxy all other requests to the target
    this.app.all('*', async (c) => {
      return this.proxyRequest(c)
    })
  }

  private async proxyRequest(c: any): Promise<Response> {
    try {
      const url = new URL(c.req.url)
      const targetUrl = `${this.target}${url.pathname}${url.search}`

      // Forward headers, excluding hop-by-hop headers
      const headers = new Headers()
      for (const [key, value] of c.req.headers.entries()) {
        if (!this.isHopByHopHeader(key)) {
          headers.set(key, value)
        }
      }

      // Add/modify headers for the target
      headers.set('Host', new URL(this.target).host)
      headers.set('X-Forwarded-For', c.req.headers.get('x-forwarded-for') || 'unknown')
      headers.set('X-Forwarded-Proto', url.protocol.slice(0, -1))

      const requestInit: RequestInit = {
        method: c.req.method,
        headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined
      }

      this.logger.info({ 
        method: c.req.method, 
        path: url.pathname, 
        targetUrl,
        headers: Object.fromEntries(headers.entries()),
        hasBody: requestInit.body !== undefined
      }, 'Proxying request')

      const response = await fetch(targetUrl, requestInit)

      // Create response with original headers (redaction middleware will process the body)
      const responseHeaders = new Headers()
      for (const [key, value] of response.headers.entries()) {
        if (!this.isHopByHopHeader(key)) {
          responseHeaders.set(key, value)
        }
      }

      const proxyResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      })

      return proxyResponse

    } catch (error) {
      this.logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        targetUrl,
        method: c.req.method,
        path: url.pathname
      }, 'Proxy request failed')
      return new Response('Bad Gateway', { status: 502 })
    }
  }

  private isHopByHopHeader(header: string): boolean {
    const hopByHopHeaders = [
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade'
    ]
    return hopByHopHeaders.includes(header.toLowerCase())
  }

  getApp(): Hono {
    return this.app
  }

  async close(): Promise<void> {
    this.configLoader.close()
  }
}

export function createProxy(config: ProxyConfig): Hono {
  const proxy = new LLMProxy(config)
  return proxy.getApp()
}