import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'

const app = express()
const PORT = 3000

console.log('🛡️ Minimal Proxy Starting...')

// Parse JSON bodies
app.use(express.json())
app.use(express.text())

// Test endpoint to verify proxy is reachable
app.get('/test', (req, res) => {
  console.log('🧪 Test endpoint hit!')
  res.json({ message: 'Proxy is working!', timestamp: new Date().toISOString() })
})

// Proxy all requests with detailed logging
app.use('/', (req, res, next) => {
  console.log(`📨 ${req.method} ${req.originalUrl} from ${req.ip}`)
  next()
}, createProxyMiddleware({
  target: 'https://api.anthropic.com',
  changeOrigin: true,
  logLevel: 'debug',
  onProxyReq: (proxyReq, req) => {
    console.log(`\n🔗 PROXYING: ${req.method} ${req.url}`)
    console.log(`🎯 Target: https://api.anthropic.com${req.url}`)
    console.log(`📋 Headers:`, Object.keys(req.headers).map(h => `${h}: ${req.headers[h]}`).join(', '))
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`📤 RESPONSE: ${proxyRes.statusCode} Content-Type: ${proxyRes.headers['content-type']}`)
    
    let responseBody = ''
    
    // Intercept response data
    const originalWrite = res.write.bind(res)
    const originalEnd = res.end.bind(res)
    
    res.write = function(chunk) {
      if (chunk) {
        const chunkStr = chunk.toString()
        responseBody += chunkStr
        console.log(`📝 CHUNK (${chunkStr.length} chars):`, chunkStr.substring(0, 300) + (chunkStr.length > 300 ? '...' : ''))
      }
      return originalWrite(chunk)
    }
    
    res.end = function(chunk) {
      if (chunk) {
        const chunkStr = chunk.toString()
        responseBody += chunkStr
        console.log(`📝 FINAL CHUNK (${chunkStr.length} chars):`, chunkStr.substring(0, 300) + (chunkStr.length > 300 ? '...' : ''))
      }
      
      if (responseBody) {
        console.log(`📋 COMPLETE RESPONSE (${responseBody.length} chars):`)
        console.log('=' * 50)
        console.log(responseBody.substring(0, 1000) + (responseBody.length > 1000 ? '\n... [TRUNCATED]' : ''))
        console.log('=' * 50)
      }
      
      return originalEnd(chunk)
    }
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error:', err)
    res.status(500).json({ error: 'Proxy error', details: err.message })
  }
}))

app.listen(PORT, () => {
  console.log(`✅ Proxy running on http://localhost:${PORT}`)
})