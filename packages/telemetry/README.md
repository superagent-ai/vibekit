# @vibe-kit/telemetry

Enterprise-grade telemetry system for agentic applications.

## Features

- 🚀 **High Performance**: Sub-millisecond event tracking with intelligent buffering
- 📊 **Real-time Analytics**: Live metrics and insights API
- 🔌 **Extensible**: Plugin system for custom implementations
- 🔒 **Secure**: Built-in PII detection and data encryption
- 📤 **Multi-format Export**: JSON, CSV, OTLP, and more
- 🎯 **Framework Agnostic**: Works with any Node.js application

## Installation

```bash
npm install @vibe-kit/telemetry
```

## Quick Start

```typescript
import { TelemetryService } from '@vibe-kit/telemetry';

// Initialize telemetry
const telemetry = new TelemetryService({
  serviceName: 'my-app',
  serviceVersion: '0.0.1',
  storage: [{
    type: 'sqlite',
    enabled: true,
  }],
  // API server configuration
  api: {
    enabled: true,
    port: 3000,
  }
});

await telemetry.initialize();

// Track events
await telemetry.track({
  eventType: 'start',
  category: 'user-action',
  action: 'button-click',
  label: 'submit-form',
});

// Query events
const events = await telemetry.query({ 
  category: 'user-action' 
});
```

## Configuration

### Storage Providers

- **SQLite** (default): Local storage with Drizzle ORM
- **OpenTelemetry**: Export to OTLP collectors
- **Memory**: In-memory storage for testing

### Security Features

- PII detection and redaction
- Data encryption at rest
- Configurable retention policies

## CLI Usage

```bash
# Start API server
telemetry api --port 3000

# Query events
telemetry query --category user-action --limit 100

# Export data
telemetry export --format csv --output events.csv
```

## Dashboard Integration

For a full-featured dashboard UI, use the standalone `@vibe-kit/dashboard` package:

```bash
# Install dashboard
npm install @vibe-kit/dashboard

# Start telemetry API server
telemetry api --port 3000

# In another terminal, start dashboard
vibekit-dashboard --api-url http://localhost:3000
```

The dashboard provides:
- Real-time event monitoring
- Session tracking and analytics
- Performance metrics visualization
- Export functionality
- WebSocket-based live updates

## Development Status

This package is currently in active development as part of the VibeKit telemetry system extraction. Features are being implemented incrementally with full backward compatibility maintained.

## License

MIT