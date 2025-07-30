import http from 'http'
import https from 'https'
import { URL } from 'url'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

const PORT = 3000
const TARGET = 'https://api.anthropic.com'

console.log('🛡️ Working Proxy Starting...')

// Entropy calculation for secret detection
const calculateEntropy = (str: string): number => {
  const charCounts = new Map<string, number>()
  
  for (const char of str) {
    charCounts.set(char, (charCounts.get(char) || 0) + 1)
  }
  
  let entropy = 0
  const length = str.length
  
  for (const count of charCounts.values()) {
    const probability = count / length
    entropy -= probability * Math.log2(probability)
  }
  
  return entropy
}

// Groq-based secret detection using ultra-fast inference
const detectSecretsWithGroq = async (text: string): Promise<{ secrets: Array<{value: string, type: string}> }> => {
  const prompt = `Analyze this text and identify any API keys, tokens, passwords, or secrets. Return ONLY a JSON array with the exact secret values and their types.

Text: ${text.substring(0, 800)}

Look for:
- API keys (sk-, xai-, ghp_, e2b_, dtn_, AIzaSy, pk_, rk_, etc.)
- Auth tokens and bearer tokens
- Email addresses  
- Credit card numbers
- Any high-entropy strings that look like secrets

Return format: {"secrets": [{"value": "exact_secret_here", "type": "api_key"}]}

Be precise - only return actual secrets, not false positives.`

  try {
    const groqApiKey = process.env.GROQ_API_KEY || 'gsk_placeholder' // Using GROQ_API_KEY from .env
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // Ultra-fast model
        messages: [
          {
            role: 'system',
            content: 'You are a security expert that identifies secrets and API keys. Return only valid JSON.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      const content = result.choices[0]?.message?.content
      
      if (content) {
        try {
          const parsed = JSON.parse(content)
          console.log(`🚀 Groq detected ${parsed.secrets?.length || 0} secrets`)
          return parsed
        } catch (parseError) {
          console.log('⚠️ Failed to parse Groq response')
        }
      }
    } else {
      console.log(`⚠️ Groq API error: ${response.status}`)
    }
  } catch (error) {
    console.log('⚠️ Groq detection unavailable, using fallback')
  }
  
  return { secrets: [] }
}

// Hybrid approach: Fast regex + LLM validation
const detectAndRedactSecrets = async (text: string): Promise<{ redacted: string, wasRedacted: boolean }> => {
  const original = text
  let redacted = text
  let hasRedactions = false
  
  // Quick regex scan for obvious patterns
  const obviousPatterns = [
    /sk-[A-Za-z0-9_-]{20,}/g,
    /xai-[A-Za-z0-9_-]{20,}/g,
    /ghp_[A-Za-z0-9_-]{20,}/g,
    /e2b_[A-Za-z0-9_-]{20,}/g,
    /dtn_[A-Za-z0-9_-]{20,}/g,
    /AIzaSy[A-Za-z0-9_-]{20,}/g,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  ]
  
  // First pass: obvious patterns
  for (const pattern of obviousPatterns) {
    if (pattern.test(redacted)) {
      redacted = redacted.replace(pattern, '[REDACTED_SECRET]')
      hasRedactions = true
    }
  }
  
  // If no obvious patterns found, use Groq for deeper analysis
  if (!hasRedactions && text.length > 50) {
    try {
      const groqResult = await detectSecretsWithGroq(text)
      
      if (groqResult.secrets.length > 0) {
        console.log(`🚀 Groq detected ${groqResult.secrets.length} secrets`)
        
        // Apply Groq-detected redactions by replacing exact values
        for (const secret of groqResult.secrets) {
          if (secret.value && secret.value.length > 10) {
            // Escape special regex characters in the secret value
            const escapedValue = secret.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const secretRegex = new RegExp(escapedValue, 'g')
            
            if (secretRegex.test(redacted)) {
              redacted = redacted.replace(secretRegex, `[REDACTED_${secret.type.toUpperCase()}]`)
              hasRedactions = true
            }
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Groq detection failed, using regex only')
    }
  }
  
  return {
    redacted,
    wasRedacted: hasRedactions
  }
}

// Synchronous wrapper for compatibility
const detectAndRedactSecretsSync = (text: string): { redacted: string, wasRedacted: boolean } => {
  // For streaming, use just the regex patterns
  const original = text
  let redacted = text
  let hasRedactions = false
  
  const patterns = [
    /sk-[A-Za-z0-9_-]{20,}/g,
    /xai-[A-Za-z0-9_-]{20,}/g, 
    /ghp_[A-Za-z0-9_-]{20,}/g,
    /e2b_[A-Za-z0-9_-]{20,}/g,
    /dtn_[A-Za-z0-9_-]{20,}/g,
    /AIzaSy[A-Za-z0-9_-]{20,}/g,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  ]
  
  for (const pattern of patterns) {
    if (pattern.test(redacted)) {
      redacted = redacted.replace(pattern, '[REDACTED_SECRET]')
      hasRedactions = true
    }
  }
  
  return { redacted, wasRedacted: hasRedactions }
}

const redactText = detectAndRedactSecrets

const server = http.createServer((clientReq, clientRes) => {
  console.log(`📨 ${clientReq.method} ${clientReq.url} from ${clientReq.socket.remoteAddress}`)
  
  const targetUrl = new URL(clientReq.url!, TARGET)
  
  console.log(`🔗 PROXYING to: ${targetUrl.href}`)
  console.log(`📋 Headers:`, JSON.stringify(clientReq.headers, null, 2))
  
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname + targetUrl.search,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: targetUrl.hostname
    }
  }
  
  const proxyReq = https.request(options, (proxyRes) => {
    console.log(`📤 RESPONSE: ${proxyRes.statusCode} ${proxyRes.statusMessage}`)
    console.log(`📤 Response Headers:`, JSON.stringify(proxyRes.headers, null, 2))
    
    // Forward status and headers
    clientRes.writeHead(proxyRes.statusCode!, proxyRes.headers)
    
    let responseBody = ''
    
    let chunks: Buffer[] = []
    
    proxyRes.on('data', (chunk) => {
      responseBody += chunk.toString()
      chunks.push(chunk)
    })
    
    proxyRes.on('end', () => {
      console.log(`✅ RESPONSE RECEIVED (${responseBody.length} total chars)`)
      
      // Simple regex-based redaction only
      const { redacted: redactedResponse, wasRedacted } = detectAndRedactSecretsSync(responseBody)
      
      console.log(`🔍 SECRETS DETECTED: ${wasRedacted ? 'YES' : 'NO'}`)
      
      if (wasRedacted) {
        console.log('🚨 API KEYS FOUND AND REDACTED!')
        clientRes.write(Buffer.from(redactedResponse))
      } else {
        // Send original response
        for (const chunk of chunks) {
          clientRes.write(chunk)
        }
      }
      
      clientRes.end()
    })
    
    proxyRes.on('error', (err) => {
      console.error('❌ Proxy response error:', err)
      clientRes.writeHead(500)
      clientRes.end('Proxy error')
    })
  })
  
  proxyReq.on('error', (err) => {
    console.error('❌ Proxy request error:', err)
    clientRes.writeHead(500)
    clientRes.end('Proxy error')
  })
  
  // Forward request body
  let requestBody = ''
  clientReq.on('data', (chunk) => {
    requestBody += chunk.toString()
    proxyReq.write(chunk)
  })
  
  clientReq.on('end', () => {
    if (requestBody) {
      const { redacted: redactedBody, wasRedacted } = detectAndRedactSecretsSync(requestBody)
      console.log(`📝 REQUEST BODY (${requestBody.length} chars):`)
      console.log(`🔒 REQUEST REDACTED: ${wasRedacted ? 'YES' : 'NO'}`)
      console.log('=' + '='.repeat(80))
      console.log(redactedBody ? redactedBody.substring(0, 1000) + (redactedBody.length > 1000 ? '...' : '') : 'No body')
      console.log('=' + '='.repeat(80))
    }
    proxyReq.end()
  })
  
  clientReq.on('error', (err) => {
    console.error('❌ Client request error:', err)
    proxyReq.destroy()
  })
})

server.listen(PORT, () => {
  console.log(`✅ Working Proxy running on http://localhost:${PORT}`)
})

server.on('error', (err) => {
  console.error('❌ Server error:', err)
})