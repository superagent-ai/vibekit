# Inngest Setup for Realtime Updates

The application uses Inngest for task management and realtime updates. WebSocket errors occur when the Inngest dev server is not running.

## Quick Fix for WebSocket Errors

If you're seeing WebSocket errors like:
```
Error: WebSocket error observed: {}
```

This is because the Inngest dev server is not running. The app will work fine without realtime updates.

## To Enable Realtime Updates

1. **Install Inngest CLI** (if not already installed):
   ```bash
   npm install -g inngest-cli
   ```

2. **Start the Inngest dev server**:
   ```bash
   npx inngest-cli@latest dev
   ```

3. **Enable realtime in environment**:
   ```bash
   # In .env.local
   NEXT_PUBLIC_INNGEST_DEV_SERVER=true
   ```

4. **Restart the Next.js dev server**:
   ```bash
   npm run dev
   ```

## Without Inngest Dev Server

The application works perfectly without realtime updates:
- ✅ Task creation works
- ✅ E2B sandbox integration works  
- ✅ Terminal and VS Code access works
- ✅ All remote access features work
- ❌ No live progress updates (you'll need to refresh)

## With Inngest Dev Server

When properly configured:
- ✅ All above features
- ✅ Live progress updates
- ✅ Real-time task status changes
- ✅ Live sandbox creation notifications

## Troubleshooting

1. **Check if Inngest is running**:
   ```bash
   curl http://localhost:8288/health
   ```

2. **Common ports**:
   - Inngest dev server: `http://localhost:8288`
   - Next.js dev server: `http://localhost:3000`

3. **Environment variables**:
   ```bash
   # Enable realtime when Inngest is running
   NEXT_PUBLIC_INNGEST_DEV_SERVER=true
   
   # Disable to prevent WebSocket errors
   NEXT_PUBLIC_INNGEST_DEV_SERVER=false
   ```

The WebSocket errors are harmless and don't affect core functionality!