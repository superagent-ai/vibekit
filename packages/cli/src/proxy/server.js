import http from 'http';
import https from 'https';
import net from 'net';
import { URL } from 'url';
import chalk from 'chalk';
import { initializeSensitivePatterns } from '../utils/redaction.js';

class ProxyServer {
  constructor(port = 8080) {
    this.port = port;
    this.server = null;
    this.requestCount = 0;
    this.responseBuffers = new Map();
    this.sseContentAccumulators = new Map(); // Track accumulated content per request
    this.sensitivePatterns = initializeSensitivePatterns();
  }

  redactSensitiveContent(content) {
    let redactedContent = content;
    
    this.sensitivePatterns.forEach(pattern => {
      redactedContent = redactedContent.replace(pattern, 'REDACTED');
    });
    
    return redactedContent;
  }

  processChunkWithBuffer(newChunk, requestId) {
    const accumulator = this.sseContentAccumulators.get(requestId);
    if (!accumulator) return newChunk;
    
    // Add new chunk to buffer
    accumulator.buffer += newChunk;
    
    // Split by lines and process complete lines
    const lines = accumulator.buffer.split('\n');
    
    // Keep the last (potentially incomplete) line in buffer
    accumulator.buffer = lines.pop() || '';
    
    // Process complete lines
    if (lines.length > 0) {
      const completeLines = lines.join('\n') + '\n';
      const redacted = this.redactSensitiveContent(completeLines);
      return redacted;
    }
    
    // No complete lines yet, don't send anything
    return null;
  }
  
  flushBuffer(requestId) {
    const accumulator = this.sseContentAccumulators.get(requestId);
    if (!accumulator || !accumulator.buffer) return null;
    
    // Process remaining buffer content
    const remaining = accumulator.buffer;
    accumulator.buffer = '';
    
    const redacted = this.redactSensitiveContent(remaining);
    return redacted;
  }


  start() {
    return new Promise((resolve, reject) => {
      // Check if server is already running
      if (this.server && this.server.listening) {
        console.log(chalk.yellow(`⚠️  Proxy server is already running on port ${this.port}`));
        resolve();
        return;
      }

      // Create HTTP proxy server
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Handle HTTPS CONNECT method for tunneling
      this.server.on('connect', (req, clientSocket, head) => {
        this.handleHttpsConnect(req, clientSocket, head);
      });

      // Start listening
      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on('error', (error) => {
        // Check if error is EADDRINUSE (port already in use)
        if (error.code === 'EADDRINUSE') {
          console.log(chalk.yellow(`⚠️  Port ${this.port} is already in use. Proxy server may already be running.`));
          resolve(); // Don't reject, just resolve to avoid error
        } else {
          reject(error);
        }
      });

      // Graceful shutdown
      process.on('SIGINT', () => {
        this.server.close(() => {
          process.exit(0);
        });
      });

      process.on('SIGTERM', () => {
        this.server.close(() => process.exit(0));
      });
    });
  }

  handleHttpRequest(req, res) {
    this.requestCount++;
    const requestId = this.requestCount;

    // Parse the target URL - handle relative URLs by prepending Anthropic API base
    let targetUrl;
    try {
      if (req.url.startsWith('/')) {
        // Relative URL - prepend Anthropic API base
        targetUrl = new URL(req.url, 'https://api.anthropic.com');
      } else {
        // Absolute URL
        targetUrl = new URL(req.url);
      }
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request: Invalid URL');
      return;
    }

    // Prepare request options
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: { ...req.headers },
      rejectUnauthorized: false // Disable SSL verification for proxy
    };

    // Clean up headers for clean forwarding
    delete options.headers['host']; // Will be set to target host
    delete options.headers['proxy-connection'];
    delete options.headers['proxy-authorization'];


    // Choose http or https module
    const httpModule = targetUrl.protocol === 'https:' ? https : http;

    // Capture request body
    let requestBody = '';
    req.on('data', (chunk) => {
      requestBody += chunk.toString();
    });

    req.on('end', () => {
      // Request body captured silently
    });


    // Make the proxied request
    const proxyReq = httpModule.request(options, (proxyRes) => {

      // Check if this is an SSE response
      const isSSE = proxyRes.headers['content-type']?.includes('text/event-stream');
      
      // Initialize response buffer and SSE accumulator for this request
      this.responseBuffers.set(requestId, '');
      if (isSSE) {
        this.sseContentAccumulators.set(requestId, {
          buffer: '' // Just buffer until we get complete lines
        });
      }

      // Forward the response headers immediately
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      // Handle SSE responses differently
      if (isSSE) {
        let eventBuffer = '';
        const accumulator = this.sseContentAccumulators.get(requestId);
        
        proxyRes.on('data', (chunk) => {
          const chunkStr = chunk.toString();
          eventBuffer += chunkStr;
          
          // Split by double newlines to get complete events
          const events = eventBuffer.split('\n\n');
          eventBuffer = events.pop() || ''; // Keep incomplete event in buffer
          
          events.forEach(eventData => {
            if (eventData.trim()) {
              const lines = eventData.split('\n');
              const event = {};
              
              lines.forEach(line => {
                if (line.startsWith('event: ')) {
                  event.type = line.substring(7);
                } else if (line.startsWith('data: ')) {
                  const data = line.substring(6);
                  try {
                    event.data = JSON.parse(data);
                  } catch {
                    event.data = data;
                  }
                }
              });
              
              // Handle different event types
              if (event.type === 'content_block_delta' && event.data?.delta?.text) {
                // Process chunk with buffering for redaction
                const redactedChunk = this.processChunkWithBuffer(event.data.delta.text, requestId);
                
                if (redactedChunk) {
                  // Forward the redacted chunk immediately
                  const redactedEventData = {
                    type: 'content_block_delta',
                    index: event.data.index || 0,
                    delta: {
                      type: 'text_delta',
                      text: redactedChunk
                    }
                  };
                  
                  const redactedEvent = `event: content_block_delta\ndata: ${JSON.stringify(redactedEventData)}\n\n`;
                  res.write(redactedEvent);
                }
              } else if (event.type === 'content_block_stop') {
                // Flush any remaining buffer content
                const finalChunk = this.flushBuffer(requestId);
                if (finalChunk) {
                  const finalEventData = {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                      type: 'text_delta',
                      text: finalChunk
                    }
                  };
                  
                  const finalEvent = `event: content_block_delta\ndata: ${JSON.stringify(finalEventData)}\n\n`;
                  res.write(finalEvent);
                }
                
                // Forward the stop event
                res.write(eventData + '\n\n');
              } else if (event.type === 'message_delta' && event.data?.usage?.output_tokens) {
                // Store the final usage data to send with our accumulated content
                accumulator.totalTokens = event.data.usage.output_tokens;
                accumulator.messageData = event.data;
                // Don't forward this yet - we'll send it after our complete content
              } else {
                // Forward all other events as-is (message_start, message_stop, content_block_start, ping, etc.)
                res.write(eventData + '\n\n');
              }
            }
          });
        });
        
        proxyRes.on('end', () => {
          // Handle any remaining buffered event
          if (eventBuffer.trim()) {
            res.write(eventBuffer + '\n\n');
          }
          res.end();
          // Clean up
          this.responseBuffers.delete(requestId);
          this.sseContentAccumulators.delete(requestId);
        });
      } else {
        // For non-SSE responses, pipe directly
        proxyRes.pipe(res);
        
        // Log non-SSE responses
        let responseBody = '';
        proxyRes.on('data', (chunk) => {
          responseBody += chunk.toString();
        });
        
        proxyRes.on('end', () => {
          this.responseBuffers.delete(requestId);
        });
      }
    });

    // Handle proxy request errors
    proxyReq.on('error', (error) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Proxy Error: ' + error.message);
    });

    // Forward the request body
    req.pipe(proxyReq);
  }

  handleHttpsConnect(req, clientSocket, head) {
    this.requestCount++;
    
    const { hostname, port } = this.parseHostPort(req.url);

    const serverSocket = new net.Socket();

    serverSocket.connect(port, hostname, () => {
      
      // Send connection established response
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      
      // Set up bidirectional pipe
      if (head && head.length) {
        serverSocket.write(head);
      }
      
      // For HTTPS tunnels, just pipe the data without logging (it's encrypted)
      // Logging encrypted binary data is not useful

      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', () => {
      clientSocket.end();
    });

    clientSocket.on('error', () => {
      serverSocket.end();
    });

    serverSocket.on('end', () => {
      // Tunnel closed silently
    });
  }

  parseHostPort(hostPort) {
    const [hostname, port] = hostPort.split(':');
    return {
      hostname,
      port: parseInt(port) || 443
    };
  }


  stop() {
    if (this.server) {
      this.server.close();
    }
    
    // Clean up response buffers
    if (this.responseBuffers) {
      this.responseBuffers.clear();
    }
    
    // Clean up SSE content accumulators
    if (this.sseContentAccumulators) {
      this.sseContentAccumulators.clear();
    }
  }
}

export default ProxyServer;