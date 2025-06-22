import { Desktop } from "@e2b/desktop";

export interface DesktopSandboxConfig {
  apiKey: string;
  template?: string;
  sandboxId?: string;
  timeoutMs?: number;
  resolution?: string;
  browser?: "chrome" | "firefox";
  streamQuality?: "low" | "medium" | "high";
  frameRate?: number;
}

export interface DesktopConnection {
  sandboxId: string;
  desktop: Desktop;
  streamUrl?: string;
  vscodeUrl?: string;
  terminalUrl?: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastActivity?: Date;
}

export class DesktopSandboxService {
  private connections: Map<string, DesktopConnection> = new Map();
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createOrConnectDesktop(config: DesktopSandboxConfig): Promise<DesktopConnection> {
    try {
      // Check if we already have a connection for this sandboxId
      if (config.sandboxId) {
        const existing = this.connections.get(config.sandboxId);
        if (existing && existing.status === "connected") {
          console.log('[DesktopSandboxService] Reusing existing desktop connection:', config.sandboxId);
          return existing;
        }
      }

      console.log('[DesktopSandboxService] Creating new desktop sandbox...');
      
      // Create or connect to desktop sandbox
      let desktop: Desktop;
      if (config.sandboxId) {
        // Try to reconnect to existing sandbox
        try {
          desktop = await Desktop.connect(config.sandboxId, {
            apiKey: config.apiKey,
          });
          console.log('[DesktopSandboxService] Reconnected to existing desktop:', config.sandboxId);
        } catch (error) {
          console.log('[DesktopSandboxService] Failed to reconnect, creating new desktop...');
          desktop = await Desktop.create({
            apiKey: config.apiKey,
            template: config.template || "desktop",
            timeoutMs: config.timeoutMs || 3600000, // 1 hour default
          });
        }
      } else {
        // Create new desktop
        desktop = await Desktop.create({
          apiKey: config.apiKey,
          template: config.template || "desktop",
          timeoutMs: config.timeoutMs || 3600000, // 1 hour default
        });
      }

      const sandboxId = desktop.sandboxId;
      console.log('[DesktopSandboxService] Desktop ready:', sandboxId);

      // Configure desktop settings
      if (config.resolution) {
        // TODO: Set resolution when API supports it
        console.log('[DesktopSandboxService] Resolution configuration:', config.resolution);
      }

      // Get connection URLs
      const connection: DesktopConnection = {
        sandboxId,
        desktop,
        streamUrl: await this.getStreamUrl(desktop),
        vscodeUrl: `https://${sandboxId}.e2b.dev/code`,
        terminalUrl: `https://${sandboxId}.e2b.dev/terminal`,
        status: "connected",
        lastActivity: new Date(),
      };

      // Store connection
      this.connections.set(sandboxId, connection);

      // Launch default browser if specified
      if (config.browser) {
        await this.launchBrowser(desktop, config.browser);
      }

      return connection;
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to create/connect desktop:', error);
      throw error;
    }
  }

  async getStreamUrl(desktop: Desktop): Promise<string> {
    try {
      // Start desktop streaming
      const stream = await desktop.stream();
      console.log('[DesktopSandboxService] Stream started:', stream);
      
      // Return the stream URL
      // Note: The actual implementation depends on E2B Desktop API
      return `wss://${desktop.sandboxId}.e2b.dev/stream`;
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to get stream URL:', error);
      throw error;
    }
  }

  async launchBrowser(desktop: Desktop, browser: "chrome" | "firefox", url?: string) {
    try {
      const browserCommand = browser === "chrome" ? "google-chrome" : "firefox";
      const targetUrl = url || "https://localhost:3000";
      
      console.log(`[DesktopSandboxService] Launching ${browser} with URL:`, targetUrl);
      
      // Launch browser using desktop API
      await desktop.start({
        cmd: `${browserCommand} --no-sandbox --disable-gpu ${targetUrl}`,
      });
      
      // Wait a bit for browser to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('[DesktopSandboxService] Browser launched successfully');
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to launch browser:', error);
      throw error;
    }
  }

  async captureScreenshot(sandboxId: string): Promise<string> {
    const connection = this.connections.get(sandboxId);
    if (!connection || connection.status !== "connected") {
      throw new Error(`No active connection for sandbox: ${sandboxId}`);
    }

    try {
      const screenshot = await connection.desktop.screenshot();
      console.log('[DesktopSandboxService] Screenshot captured');
      return screenshot;
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to capture screenshot:', error);
      throw error;
    }
  }

  async sendMouseClick(sandboxId: string, x: number, y: number, button: "left" | "right" | "middle" = "left") {
    const connection = this.connections.get(sandboxId);
    if (!connection || connection.status !== "connected") {
      throw new Error(`No active connection for sandbox: ${sandboxId}`);
    }

    try {
      await connection.desktop.click({
        x,
        y,
        button,
      });
      connection.lastActivity = new Date();
      console.log(`[DesktopSandboxService] Mouse click sent: ${button} at (${x}, ${y})`);
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to send mouse click:', error);
      throw error;
    }
  }

  async sendKeyboardInput(sandboxId: string, text: string) {
    const connection = this.connections.get(sandboxId);
    if (!connection || connection.status !== "connected") {
      throw new Error(`No active connection for sandbox: ${sandboxId}`);
    }

    try {
      await connection.desktop.write(text);
      connection.lastActivity = new Date();
      console.log('[DesktopSandboxService] Keyboard input sent:', text.substring(0, 50) + '...');
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to send keyboard input:', error);
      throw error;
    }
  }

  async sendKeyPress(sandboxId: string, key: string) {
    const connection = this.connections.get(sandboxId);
    if (!connection || connection.status !== "connected") {
      throw new Error(`No active connection for sandbox: ${sandboxId}`);
    }

    try {
      await connection.desktop.press(key);
      connection.lastActivity = new Date();
      console.log('[DesktopSandboxService] Key press sent:', key);
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to send key press:', error);
      throw error;
    }
  }

  async scroll(sandboxId: string, x: number, y: number, deltaX: number, deltaY: number) {
    const connection = this.connections.get(sandboxId);
    if (!connection || connection.status !== "connected") {
      throw new Error(`No active connection for sandbox: ${sandboxId}`);
    }

    try {
      await connection.desktop.scroll({
        x,
        y,
        deltaX,
        deltaY,
      });
      connection.lastActivity = new Date();
      console.log(`[DesktopSandboxService] Scroll sent at (${x}, ${y}) with delta (${deltaX}, ${deltaY})`);
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to send scroll:', error);
      throw error;
    }
  }

  async getWindowInfo(sandboxId: string) {
    const connection = this.connections.get(sandboxId);
    if (!connection || connection.status !== "connected") {
      throw new Error(`No active connection for sandbox: ${sandboxId}`);
    }

    try {
      const currentWindow = await connection.desktop.getCurrentWindow();
      const allWindows = await connection.desktop.getWindows();
      
      return {
        current: currentWindow,
        all: allWindows,
      };
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to get window info:', error);
      throw error;
    }
  }

  async extendSession(sandboxId: string, additionalMs: number = 3600000) {
    const connection = this.connections.get(sandboxId);
    if (!connection || connection.status !== "connected") {
      throw new Error(`No active connection for sandbox: ${sandboxId}`);
    }

    try {
      // E2B Desktop doesn't have a direct extend method in the current API
      // This would need to be implemented via the E2B API directly
      console.log(`[DesktopSandboxService] Session extension requested for ${additionalMs}ms`);
      connection.lastActivity = new Date();
      
      // TODO: Implement actual session extension when API supports it
      return true;
    } catch (error) {
      console.error('[DesktopSandboxService] Failed to extend session:', error);
      throw error;
    }
  }

  async disconnect(sandboxId: string) {
    const connection = this.connections.get(sandboxId);
    if (!connection) {
      return;
    }

    try {
      await connection.desktop.close();
      connection.status = "disconnected";
      this.connections.delete(sandboxId);
      console.log('[DesktopSandboxService] Disconnected from desktop:', sandboxId);
    } catch (error) {
      console.error('[DesktopSandboxService] Error during disconnect:', error);
    }
  }

  getConnection(sandboxId: string): DesktopConnection | undefined {
    return this.connections.get(sandboxId);
  }

  getAllConnections(): DesktopConnection[] {
    return Array.from(this.connections.values());
  }
}

// Singleton instance
let desktopService: DesktopSandboxService | null = null;

export function getDesktopSandboxService(): DesktopSandboxService {
  if (!desktopService) {
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) {
      throw new Error("E2B_API_KEY is not configured");
    }
    desktopService = new DesktopSandboxService(apiKey);
  }
  return desktopService;
}