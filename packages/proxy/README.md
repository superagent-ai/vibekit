# @vibekit/proxy

TypeScript + Hono LLM Proxy with secret redaction capabilities.

## Features

- **Secret Redaction**: Automatically redacts sensitive tokens from LLM responses
- **Streaming Support**: Handles both JSON and Server-Sent Events (SSE) responses
- **Hot-Reload Config**: YAML configuration with SIGHUP hot-reload support
- **Audit Logging**: Comprehensive audit trail for compliance
- **Health Monitoring**: Built-in metrics and health checks
- **High Performance**: ≤ 2ms p95 latency overhead

## Quick Start

### Running the Proxy Server

```bash
# Install dependencies
npm install

# Start the proxy server
npm run start

# Or use the serve alias
npm run serve
```

### Environment Configuration

Configure the proxy using environment variables:

```bash
export PROXY_CONFIG_PATH="./config/redact.yml"
export PROXY_TARGET="https://api.anthropic.com"
export PROXY_PORT="3000"
export PROXY_LOG_LEVEL="info"

npm run start
```

### Programmatic Usage

```typescript
import { createProxy } from '@vibekit/proxy'

const app = createProxy({
  configPath: './config/redact.yml',
  target: 'https://api.anthropic.com'
})

export default app
```

## Configuration

Create a `redact.yml` file:

```yaml
secrets:
  env_vars:
    - "AWS_*"
    - "OPENAI_API_KEY"
    - "DATABASE_URL"
  patterns:
    - name: "aws_access_key"
      regex: "AKIA[0-9A-Z]{16}"
    - name: "jwt_token"
      regex: "eyJ[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+"
```

## Claude Code Integration

```bash
export CLAUDE_API_BASE="https://your-proxy.example.com"
claude-code "your prompt here"
```