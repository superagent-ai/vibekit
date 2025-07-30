import { serve } from '@hono/node-server'
import { createProxy } from './proxy.js'
import { existsSync } from 'fs'
import path from 'path'

// Configuration from environment variables or defaults
const config = {
  configPath: process.env.PROXY_CONFIG_PATH || path.join(process.cwd(), 'config/redact.yml'),
  target: process.env.PROXY_TARGET || 'https://api.anthropic.com',
  port: parseInt(process.env.PROXY_PORT || '3000'),
  logLevel: (process.env.PROXY_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error'
}

// Validate config file exists
if (!existsSync(config.configPath)) {
  console.log(`⚠️  Config file not found: ${config.configPath}`)
  console.log(`   Using default redaction rules.`)
  console.log(`   Set PROXY_CONFIG_PATH environment variable to specify a custom config.`)
  console.log('')
}

console.log(`🛡️  VibeKit Proxy - LLM Secret Redaction Server`)
console.log(`🔧 Configuration:`)
console.log(`   • Config: ${config.configPath}`)
console.log(`   • Target: ${config.target}`)
console.log(`   • Port: ${config.port}`)
console.log(`   • Log Level: ${config.logLevel}`)
console.log('')

console.log(`🚀 Server starting on http://localhost:${config.port}`)
console.log('')

console.log(`💡 Usage with Claude Code:`)
console.log(`   export CLAUDE_API_BASE="http://localhost:${config.port}"`)
console.log(`   claude-code "your prompt here"`)
console.log('')

console.log(`📊 Endpoints:`)
console.log(`   • Health check: http://localhost:${config.port}/healthz`)
console.log(`   • Audit log: http://localhost:${config.port}/internal/audit`)
console.log(`   • All other requests: proxied to ${config.target}`)
console.log('')

try {
  const app = createProxy(config)
  
  serve({
    fetch: app.fetch,
    port: config.port
  })

  console.log(`✅ Proxy server running successfully!`)
  console.log(`   Press Ctrl+C to stop the server`)
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n🛑 Shutting down proxy server...`)
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log(`\n🛑 Shutting down proxy server...`)
    process.exit(0)
  })

} catch (error) {
  console.error(`❌ Failed to start proxy server:`, error)
  process.exit(1)
}