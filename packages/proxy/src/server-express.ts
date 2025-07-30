import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import cors from 'cors'
import { existsSync } from 'fs'
import path from 'path'
// Custom redaction function
const redactText = (text: string): string => {
  let redacted = text
  
  // API Key patterns
  redacted = redacted.replace(/xai-[A-Za-z0-9]+/g, '[REDACTED_GROK_KEY]')
  redacted = redacted.replace(/sk-ant-api03-[A-Za-z0-9_-]+/g, '[REDACTED_ANTHROPIC_KEY]')
  redacted = redacted.replace(/sk-proj-[A-Za-z0-9_-]+/g, '[REDACTED_OPENAI_KEY]')
  redacted = redacted.replace(/ghp_[A-Za-z0-9]+/g, '[REDACTED_GITHUB_TOKEN]')
  redacted = redacted.replace(/e2b_[A-Za-z0-9]+/g, '[REDACTED_E2B_KEY]')
  redacted = redacted.replace(/dtn_[A-Za-z0-9]+/g, '[REDACTED_DAYTONA_KEY]')
  redacted = redacted.replace(/AIzaSy[A-Za-z0-9_-]+/g, '[REDACTED_GEMINI_KEY]')
  
  // Environment variable patterns
  redacted = redacted.replace(/([A-Z_]+_API_KEY)=([^\s\n]+)/g, '$1=[REDACTED]')
  redacted = redacted.replace(/([A-Z_]+_TOKEN)=([^\s\n]+)/g, '$1=[REDACTED]')
  redacted = redacted.replace(/([A-Z_]+_SECRET)=([^\s\n]+)/g, '$1=[REDACTED]')
  
  return redacted
}
import { createSecureLogger } from './middleware.js'
import { v4 as uuidv4 } from 'uuid'

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

const app = express()
const logger = createSecureLogger(config.logLevel)

// CORS middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'anthropic-version']
}))

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    redactionEnabled: true
  })
})

// Audit endpoint (for internal monitoring)
app.get('/internal/audit', (req, res) => {
  res.json({
    message: 'Redaction audit not available with redact-secrets package',
    timestamp: new Date().toISOString()
  })
})

// Simple redaction function using custom regex
const redactContent = (text: string, responseId: string) => {
  try {
    console.log(`🔍 Processing text for redaction (${text.length} chars)`)
    console.log(`🔍 Sample text: ${text.substring(0, 200)}...`)
    
    const redacted = redactText(text)
    console.log(`🔒 Redaction complete for ${responseId} - Original: ${text.length}, Redacted: ${redacted.length}`)
    
    if (text !== redacted) {
      console.log('✅ Secrets were redacted!')
      console.log(`✅ Sample redacted: ${redacted.substring(0, 200)}...`)
    } else {
      console.log('⚠️ No secrets found to redact')
    }
    
    return redacted
  } catch (error) {
    console.error('❌ Redaction error:', error)
    return text
  }
}

// Proxy middleware with redaction using response transform
const proxyMiddleware = createProxyMiddleware({
  target: config.target,
  changeOrigin: true,
  logLevel: 'debug',
  onProxyReq: (proxyReq, req, res) => {
    req.responseId = uuidv4()
    console.log(`🔗 PROXY REQUEST: ${req.method} ${config.target}${req.url}`)
    console.log(`🔗 Headers being sent:`, Object.keys(proxyReq.getHeaders()))
  },
  onProxyRes: (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] || ''
    console.log(`📤 PROXY RESPONSE: Status ${proxyRes.statusCode}, Content-Type: ${contentType}`)
    console.log(`📤 Response headers:`, Object.keys(proxyRes.headers))
    
    // IMPORTANT: Don't use selfHandleResponse and manual piping together
    // Let's just transform the response
    const originalWrite = res.write
    const originalEnd = res.end
    let responseBody = ''
    
    res.write = function(chunk) {
      responseBody += chunk.toString()
      return originalWrite.call(this, chunk)
    }
    
    res.end = function(chunk) {
      if (chunk) {
        responseBody += chunk.toString()
      }
      
      console.log(`🔍 Full response body length: ${responseBody.length}`)
      
      if (responseBody) {
        const redactedResponse = redactContent(responseBody, req.responseId)
        console.log(`✅ Redaction applied, sending modified response`)
        return originalEnd.call(this, redactedResponse)
      }
      
      return originalEnd.call(this, chunk)
    }
  },
  onError: (err, req, res) => {
    console.error('❌ PROXY ERROR:', err.message)
    if (!res.headersSent) {
      res.status(502).json({ error: 'Bad Gateway' })
    }
  }
})

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - ${new Date().toISOString()}`)
  console.log(`   Headers:`, Object.keys(req.headers))
  next()
})

// Apply proxy to all routes except health check and audit
app.use((req, res, next) => {
  console.log(`🔍 Checking route: ${req.path}`)
  if (req.path === '/healthz' || req.path === '/internal/audit') {
    console.log(`⚠️ Skipping proxy for: ${req.path}`)
    return next()
  }
  console.log(`✅ Using proxy for: ${req.path}`)
  proxyMiddleware(req, res, next)
})

try {
  app.listen(config.port, () => {
    console.log(`✅ Proxy server running successfully!`)
    console.log(`   Press Ctrl+C to stop the server`)
  })

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n🛑 Shutting down proxy server...`)
    configLoader.close()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log(`\n🛑 Shutting down proxy server...`)
    configLoader.close()
    process.exit(0)
  })

} catch (error) {
  console.error(`❌ Failed to start proxy server:`, error)
  process.exit(1)
}