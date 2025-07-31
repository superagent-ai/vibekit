# @vibe-kit/telemetry

Enterprise-grade telemetry system for agentic applications.

## Features

- 🚀 **High Performance**: Sub-millisecond event tracking with intelligent buffering
- 📊 **Real-time Analytics**: Live dashboards and metrics
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
  serviceVersion: '1.0.0',
  storage: [{
    type: 'sqlite',
    enabled: true,
  }],
  dashboard: {
    enabled: true,
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

// Start dashboard
await telemetry.startDashboard({ port: 3000 });
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
# Start dashboard
telemetry dashboard --port 3000

# Query events
telemetry query --category user-action --limit 100

# Export data
telemetry export --format csv --output events.csv
```

## Development Status

This package is currently in active development as part of the VibeKit telemetry system extraction. Features are being implemented incrementally with full backward compatibility maintained.

## License

MIT