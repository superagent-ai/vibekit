# @vibe-kit/dashboard

A real-time analytics dashboard for monitoring AI-assisted coding sessions with Vibekit CLI. This is a standalone npm package that provides a Next.js-based dashboard.

## Overview

The Vibekit dashboard provides comprehensive insights into your coding sessions, command execution, and agent interactions. Built with Next.js and TypeScript, it offers a modern, responsive interface for tracking productivity and analyzing coding patterns.

## Features

- 📊 **Real-time Analytics** - Live tracking of coding sessions and agent activity
- 🔍 **Command History** - Detailed logs of all executed commands and their outcomes
- ⚡ **Performance Metrics** - Response times, success rates, and efficiency analytics
- 🎯 **Project Insights** - File modification patterns and project activity
- 📈 **Session Tracking** - Duration, productivity metrics, and workflow analysis
- 🌐 **Modern UI** - Clean, responsive interface built with Tailwind CSS

## Installation

```bash
npm install @vibe-kit/dashboard
```

## Getting Started

### Via VibeKit CLI (Recommended)
The dashboard is automatically managed by the Vibekit CLI:

```bash
# Start dashboard from CLI (installs package automatically)
vibekit dashboard

# Check dashboard status
vibekit dashboard status
```

### Direct Usage

```javascript
const DashboardServer = require('@vibe-kit/dashboard');

const server = new DashboardServer({
  port: 3001,
  hostname: 'localhost'
});

await server.start();
```

### CLI Command

```bash
vibe-kit-dashboard --port 3001
```

### Development

For development purposes:

```bash
npm install
npm run dev
```

The dashboard will be available at [http://localhost:3001](http://localhost:3001).

## Architecture

```
dashboard/
├── app/                    # Next.js App Router
│   ├── api/               # API routes for analytics data
│   │   └── analytics/     # Analytics endpoints
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx          # Main dashboard page
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   └── metric-card.tsx   # Analytics display components
├── lib/                   # Utilities and types
│   ├── analytics.ts      # Analytics data processing
│   ├── types.ts          # TypeScript type definitions
│   └── utils.ts          # Utility functions
├── manager.ts            # Dashboard server management
├── server.ts             # Dashboard server implementation
└── package.json          # Dependencies and scripts
```

## API Endpoints

### Analytics Data
- `GET /api/analytics` - Current session analytics
- `GET /api/analytics/summary` - Session summary and metrics

### Data Format

The dashboard expects analytics data in the following format:

```typescript
interface SessionAnalytics {
  sessionId: string;
  startTime: Date;
  duration: number;
  commandsExecuted: number;
  filesModified: string[];
  agentType: string;
  performance: {
    averageResponseTime: number;
    successRate: number;
  };
}
```

## Configuration

The dashboard server can be configured through the Vibekit CLI configuration:

```json
{
  "dashboard": {
    "port": 3001,
    "autoStart": false,
    "analytics": {
      "enabled": true,
      "retention": 30
    }
  }
}
```

## Development

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with shadcn/ui
- **Charts**: Recharts for data visualization

### Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript checks

### Adding New Metrics

1. Update the analytics types in `lib/types.ts`
2. Modify the API endpoints in `app/api/analytics/`
3. Add new components in `components/`
4. Update the main dashboard page in `app/page.tsx`

## Integration

The dashboard automatically integrates with:
- Vibekit CLI logging system
- Agent command execution tracking
- File system change monitoring
- Session management

All data is collected passively during normal CLI usage and displayed in real-time.