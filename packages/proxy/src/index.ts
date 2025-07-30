export { createProxy, LLMProxy } from './proxy.js'
export { SecretRedactor } from './redactor.js'
export { ConfigLoader, createDefaultConfig } from './config.js'
export { redactionMiddleware, createSecureLogger } from './middleware.js'
export type { 
  RedactionRule, 
  RedactionConfig, 
  ProxyConfig, 
  RedactionMetrics, 
  AuditLogEntry 
} from './types.js'

import { createProxy } from './proxy.js'
import type { ProxyConfig } from './types.js'

// Default server setup for easy deployment
export async function serve(config: ProxyConfig): Promise<void> {
  const { serve } = await import('@hono/node-server')
  const app = createProxy(config)
  
  const port = config.port || 3000
  
  console.log(`🚀 LLM Proxy server starting on port ${port}`)
  console.log(`📋 Config file: ${config.configPath}`)
  console.log(`🎯 Target: ${config.target}`)
  
  serve({
    fetch: app.fetch,
    port
  })
}