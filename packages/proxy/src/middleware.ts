import { Context, Next } from 'hono'
import pino from 'pino'
import { SecretRedactor } from './redactor.js'
import { v4 as uuidv4 } from 'uuid'

export interface RedactionMiddlewareOptions {
  redactor: SecretRedactor
  logger: pino.Logger
  failClosed?: boolean
}

export function redactionMiddleware(options: RedactionMiddlewareOptions) {
  const { redactor, logger, failClosed = true } = options

  return async (c: Context, next: Next) => {
    const responseId = uuidv4()
    c.set('responseId', responseId)

    try {
      // Proceed with the request
      await next()

      // Redact response body if it's JSON or text
      const contentType = c.res.headers.get('content-type') || ''
      const isStreamingResponse = contentType.includes('text/event-stream') || 
                                  contentType.includes('application/x-ndjson')

      if (isStreamingResponse) {
        // Handle streaming responses
        await handleStreamingResponse(c, redactor, logger, responseId)
      } else {
        // Handle regular responses
        await handleRegularResponse(c, redactor, logger, responseId)
      }

    } catch (error) {
      logger.error({ error, responseId }, 'Redaction middleware error')
      
      if (failClosed) {
        return c.json({ error: 'Internal server error' }, 500)
      }
      
      // If not fail-closed, let the error propagate
      throw error
    }
  }
}

async function handleRegularResponse(
  c: Context,
  redactor: SecretRedactor,
  logger: pino.Logger,
  responseId: string
) {
  const originalResponse = c.res
  
  if (!originalResponse.body) {
    return
  }

  try {
    const originalText = await originalResponse.text()
    const contentType = originalResponse.headers.get('content-type') || ''

    let redactedContent: string

    if (contentType.includes('application/json')) {
      // Parse JSON, redact, and stringify
      const jsonData = JSON.parse(originalText)
      const redactedData = redactor.redact(jsonData, responseId)
      redactedContent = JSON.stringify(redactedData)
    } else {
      // Treat as plain text
      redactedContent = redactor.redact(originalText, responseId)
    }

    // Create new response with redacted content
    const newResponse = new Response(redactedContent, {
      status: originalResponse.status,
      statusText: originalResponse.statusText,
      headers: originalResponse.headers
    })

    // Replace the response
    c.res = newResponse

    logger.debug({ responseId, originalLength: originalText.length, redactedLength: redactedContent.length }, 'Response redacted')

  } catch (error) {
    logger.error({ error, responseId }, 'Failed to redact regular response')
    throw error
  }
}

async function handleStreamingResponse(
  c: Context,
  redactor: SecretRedactor,
  logger: pino.Logger,
  responseId: string
) {
  const originalResponse = c.res
  
  if (!originalResponse.body) {
    return
  }

  try {
    const reader = originalResponse.body.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = ''
        const BUFFER_LIMIT = 4096 // 4KB buffer for sliding window

        try {
          while (true) {
            const { done, value } = await reader.read()
            
            if (done) {
              // Process remaining buffer
              if (buffer) {
                const redactedBuffer = redactor.redact(buffer, responseId)
                controller.enqueue(encoder.encode(redactedBuffer))
              }
              controller.close()
              break
            }

            const chunk = decoder.decode(value, { stream: true })
            buffer += chunk

            // Process complete lines/events for SSE
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.trim()) {
                const redactedLine = redactor.redact(line, responseId)
                controller.enqueue(encoder.encode(redactedLine + '\n'))
              } else {
                controller.enqueue(encoder.encode('\n'))
              }
            }

            // Prevent buffer from growing too large
            if (buffer.length > BUFFER_LIMIT) {
              const redactedBuffer = redactor.redact(buffer, responseId)
              controller.enqueue(encoder.encode(redactedBuffer))
              buffer = ''
            }
          }
        } catch (error) {
          logger.error({ error, responseId }, 'Error in streaming redaction')
          controller.error(error)
        }
      }
    })

    // Create new streaming response
    const newResponse = new Response(stream, {
      status: originalResponse.status,
      statusText: originalResponse.statusText,
      headers: originalResponse.headers
    })

    c.res = newResponse

    logger.debug({ responseId }, 'Streaming response redaction setup')

  } catch (error) {
    logger.error({ error, responseId }, 'Failed to setup streaming redaction')
    throw error
  }
}

export function createSecureLogger(level: string = 'info'): pino.Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.headers["x-auth-token"]',
        'req.body.api_key',
        'req.body.secret',
        'req.body.password',
        'res.body'
      ],
      censor: '[REDACTED]'
    },
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err
    }
  })
}