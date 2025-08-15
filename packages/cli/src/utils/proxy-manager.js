import ProxyServer from '@vibe-kit/proxy/src/server.js';

export class ProxyManager {
  constructor() {
    this.proxyServer = null;
    this.port = null;
  }

  async start(port = 8080) {
    if (this.proxyServer) {
      console.log(`Proxy already running on port ${this.port}`);
      return this.port;
    }

    try {
      // Use the ProxyServer class directly
      this.proxyServer = new ProxyServer(port);
      await this.proxyServer.start();
      
      this.port = port;
      return port;
    } catch (error) {
      throw error;
    }
  }

  async stop() {
    if (this.proxyServer) {
      await this.proxyServer.stop();
      this.proxyServer = null;
      this.port = null;
    }
  }

  isRunning() {
    return this.proxyServer !== null;
  }

  getPort() {
    return this.port;
  }

  async detectExternalProxy(port = 8080) {
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async ensureProxy(port = 8080) {
    // First check if external proxy is running
    if (await this.detectExternalProxy(port)) {
      return port;
    }

    // If not, start our own
    return await this.start(port);
  }
}

// Singleton instance
export const proxyManager = new ProxyManager();