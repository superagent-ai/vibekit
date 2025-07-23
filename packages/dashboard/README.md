# VibeKit Telemetry Dashboard

A real-time monitoring and analytics dashboard for VibeKit telemetry data, built with Next.js, React, and ShadCN UI.

## Features

- **Real-time Monitoring**: Live updates of system health, metrics, and performance data
- **Interactive Charts**: Visual representation of telemetry data using Recharts
- **Health Status**: Comprehensive system health monitoring with alerts
- **Session Management**: Track and analyze telemetry sessions
- **Performance Analytics**: Deep dive into performance metrics and trends
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Dark/Light Mode**: Automatic theme switching with system preference detection

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- VibeKit telemetry server running on port 8080

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3001` to view the dashboard.

### Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Telemetry server URL (defaults to http://localhost:8080)
TELEMETRY_API_URL=http://localhost:8080
```

## Project Structure

```
packages/dashboard/
├── app/                    # Next.js App Router
│   ├── globals.css        # Global styles import
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Main dashboard page
│   ├── analytics/         # Analytics deep dive
│   ├── sessions/          # Session management
│   └── health/            # System health monitoring
├── components/            # React components
│   ├── ui/               # ShadCN UI components
│   ├── charts/           # Chart components
│   ├── metrics/          # Metrics display components
│   ├── tables/           # Data table components
│   └── layout/           # Layout components
├── hooks/                # Custom React hooks
│   └── use-telemetry-api.ts
├── lib/                  # Utility libraries
│   ├── telemetry-api.ts  # API client
│   ├── types.ts          # TypeScript types
│   └── utils.ts          # Utility functions
└── styles/               # CSS and styling
    └── globals.css       # Global styles with Tailwind
```

## API Integration

The dashboard connects to the VibeKit telemetry server using the following endpoints:

- **GET /health** - System health status
- **GET /metrics** - Real-time metrics
- **GET /analytics** - Analytics dashboard data
- **GET /query** - Session and event queries

### Data Flow

1. **Real-time Updates**: Dashboard polls telemetry server every 5-30 seconds
2. **Caching**: TanStack Query provides intelligent caching and background updates
3. **Error Handling**: Graceful fallbacks and retry logic for network issues
4. **Performance**: Optimized queries with stale-while-revalidate patterns

## Development

### Available Scripts

- `npm run dev` - Start development server on port 3001
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript checks

### Development Workflow

1. **Start telemetry server:**
   ```bash
   # From project root
   PORT=8080 HOST=0.0.0.0 node scripts/telemetry-server.js
   ```

2. **Start dashboard:**
   ```bash
   # In packages/dashboard/
   npm run dev
   ```

3. **View in browser:**
   - Dashboard: http://localhost:3001
   - Telemetry API: http://localhost:8080

### Adding New Features

1. **New API Endpoints**: Add methods to `lib/telemetry-api.ts`
2. **Data Fetching**: Create hooks in `hooks/use-telemetry-api.ts`
3. **UI Components**: Add components to appropriate directories
4. **New Pages**: Create in `app/` directory using App Router

## Customization

### Theming

The dashboard uses ShadCN UI with CSS variables for theming. Customize colors in `styles/globals.css`:

```css
:root {
  --primary: 221.2 83.2% 53.3%;
  --secondary: 210 40% 96%;
  /* ... more variables */
}
```

### Charts

Charts are built with Recharts. Customize chart colors using CSS variables:

```css
:root {
  --chart-1: 12 76% 61%;
  --chart-2: 173 58% 39%;
  /* ... more chart colors */
}
```

## Deployment

### Production Build

```bash
npm run build
npm run start
```

### Environment Configuration

Set environment variables for production:

```bash
TELEMETRY_API_URL=https://your-telemetry-server.com
NODE_ENV=production
```

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure telemetry server is running on port 8080
2. **CORS Issues**: Configure CORS headers in telemetry server if needed
3. **Build Errors**: Check Node.js version (requires 18.0.0+)

### Debug Mode

Enable debug logging:

```bash
DEBUG=dashboard:* npm run dev
```

### Performance Issues

- Check network tab for slow API calls
- Monitor React DevTools for unnecessary re-renders
- Use TanStack Query DevTools for cache inspection

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and test thoroughly
4. Submit a pull request with detailed description

## License

This project is part of the VibeKit SDK and follows the same license terms.
