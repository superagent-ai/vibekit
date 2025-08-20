# VibeKit Dashboard Security Model

## Overview

The VibeKit Dashboard implements a **localhost-only security model** designed for maximum simplicity and security for local development environments. This model ensures that your dashboard and its data remain completely isolated from external network access while providing a seamless local experience.

## Core Security Principles

### 1. Localhost-Only Binding

The dashboard server is hard-coded to bind exclusively to `127.0.0.1` (IPv4 localhost) and cannot be accessed from external network interfaces.

```javascript
// server.js
const hostname = '127.0.0.1'; // Localhost only for security
server.listen(port, hostname, ...);
```

**Why this matters:**
- **Network Isolation**: The dashboard is completely invisible to other devices on your network
- **No External Access**: Even if your firewall is misconfigured, the dashboard cannot be accessed remotely
- **No Port Forwarding Risk**: Services like ngrok or SSH tunnels would require explicit user action

### 2. Request Origin Validation

Every incoming request is validated through multiple layers:

```typescript
// middleware.ts
- Validates Host header is localhost/127.0.0.1/::1
- Checks for proxy headers (X-Forwarded-For, X-Real-IP)
- Blocks requests with external forwarding indicators
- Returns 403 Forbidden for non-localhost requests
```

**Security checks:**
- Host header validation
- Proxy header detection
- IPv4 and IPv6 localhost verification
- External forwarding prevention

### 3. Security Headers

All responses include comprehensive security headers to prevent common web vulnerabilities:

```javascript
X-Frame-Options: DENY              // Prevents clickjacking
X-Content-Type-Options: nosniff    // Prevents MIME sniffing
X-XSS-Protection: 1; mode=block    // XSS protection (legacy browser support)
Referrer-Policy: strict-origin-when-cross-origin  // Controls referrer information
Content-Security-Policy: ...       // Restricts resource loading (see below)
```

#### Content Security Policy (CSP)

The dashboard implements a strict Content Security Policy that acts as an additional layer of XSS protection:

```javascript
// Production CSP (strict)
default-src 'self'                 // Only same-origin resources by default
script-src 'self'                  // Scripts only from same origin
style-src 'self'                   // Styles only from same origin
img-src 'self' data: blob:         // Images from self, data URIs, and blobs
font-src 'self' data:              // Fonts from self and data URIs
connect-src 'self' ws://127.0.0.1:* // API and WebSocket to localhost only
frame-ancestors 'none'             // Cannot be embedded in iframes
base-uri 'self'                    // Prevents <base> tag injection
form-action 'self'                 // Forms submit only to same origin
```

**CSP Benefits:**
- **Blocks inline scripts**: Prevents injection of malicious `<script>` tags
- **Blocks external resources**: Prevents loading of malicious external scripts/styles
- **Prevents data exfiltration**: Blocks connections to unauthorized domains
- **DOM XSS protection**: Limits what injected scripts can do
- **Defense in depth**: Provides protection even if other measures fail

**Development Mode:** CSP is slightly relaxed (`unsafe-inline` and `unsafe-eval`) to support Next.js hot module replacement.

### 4. Rate Limiting

API endpoints are protected with configurable rate limits:

- **General API**: 100 requests/minute
- **Stream Endpoints**: 10 connections/minute  
- **Upload Endpoints**: 20 uploads/minute

Rate limiting prevents:
- Resource exhaustion attacks
- Brute force attempts
- Accidental infinite loops in client code

## Architecture Decisions

### Why No Authentication for Local Use?

Traditional authentication (passwords, tokens, OAuth) adds complexity without meaningful security benefits for localhost-only services:

1. **Already Protected**: If an attacker can access localhost, they already have system access
2. **Developer Friction**: Requiring login for local tools disrupts workflow
3. **Token Management**: Managing local tokens/passwords creates additional security surface
4. **False Security**: Local authentication doesn't protect against local threats

### Port Configuration

The dashboard uses a configurable port (default: 3001) stored in `~/.vibekit/settings.json`:

```json
{
  "dashboard": {
    "port": 3001,
    "host": "127.0.0.1",
    "autoOpen": true
  }
}
```

**Benefits:**
- Predictable port for bookmarks and scripts
- Avoids conflicts with other services
- User control over port selection
- No random ports to track

## Security Boundaries

### What IS Protected

✅ **Network Access**: Dashboard cannot be accessed from external networks  
✅ **XSS Attacks**: Content Security Policy blocks script injection and data exfiltration  
✅ **CSRF Attacks**: Localhost-only prevents cross-site request forgery  
✅ **Clickjacking**: X-Frame-Options prevents embedding in malicious sites  
✅ **Port Scanning**: Service invisible to network scanners  
✅ **Accidental Exposure**: Misconfigurations cannot expose the dashboard  
✅ **Resource Exhaustion**: Rate limiting prevents DoS attacks  
✅ **MIME Sniffing**: X-Content-Type-Options prevents browser interpretation attacks

### What IS NOT Protected

❌ **Local Malware**: Malicious local software can access localhost services  
❌ **User Mistakes**: Users explicitly tunneling/proxying the service  
❌ **System Compromise**: Root/admin access bypasses all protections  
❌ **Browser Extensions**: Malicious extensions can interact with localhost

## Best Practices for Users

### DO ✅

- Keep your system and browser updated
- Only install trusted browser extensions
- Use the dashboard only for local development
- Keep sensitive data out of the dashboard
- Review logs for unexpected access patterns

### DON'T ❌

- Expose the dashboard through tunneling services (ngrok, localtunnel)
- Modify the server to bind to `0.0.0.0` or external IPs
- Share dashboard URLs with external services
- Store production credentials in the dashboard
- Disable security headers or middleware

## Implementation Files

Key security implementations can be found in:

- `packages/dashboard/server.js` - Localhost binding and security headers
- `packages/dashboard/middleware.ts` - Request validation and blocking
- `packages/dashboard/lib/rate-limiter.ts` - Rate limiting implementation
- `packages/dashboard/app/api/health/route.ts` - Health check endpoint
- `packages/dashboard/lib/session-security.ts` - Path traversal protection

## Future Considerations

While the current localhost-only model provides excellent security for local development, future cloud sync features will require:

1. **OAuth Integration**: For cloud authentication
2. **API Keys**: For service-to-service communication
3. **Encryption**: For data in transit to cloud services
4. **Audit Logging**: For compliance and security monitoring

These features will be **opt-in** and will not compromise the simplicity of local-only usage.

## Security Reporting

If you discover a security vulnerability in VibeKit:

1. **Do NOT** create a public GitHub issue
2. Email security concerns to: security@vibekit.sh
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We take security seriously and will respond to valid concerns within 48 hours.

## Summary

The VibeKit Dashboard's localhost-only security model provides a robust security boundary through:

- **Network isolation** via localhost-only binding
- **Request validation** to prevent external access
- **Security headers** to prevent web vulnerabilities  
- **Rate limiting** to prevent resource exhaustion
- **No authentication overhead** for local development

This design prioritizes **simplicity**, **security**, and **developer experience** for local development environments while maintaining a clear path for future cloud integration.