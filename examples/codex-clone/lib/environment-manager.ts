import { useEnvironmentStore } from "@/stores/environments";

export class EnvironmentManager {
  private static instance: EnvironmentManager;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    // DISABLED: Environment cleanup to prevent automatic E2B sandbox destruction
    // Only start cleanup timer in browser
    // if (typeof window !== 'undefined') {
    //   this.startCleanupTimer();
    // }
    console.log('[EnvironmentManager] Auto-cleanup disabled to preserve E2B sandboxes');
  }

  public static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  private startCleanupTimer() {
    if (typeof window === 'undefined') return; // Don't run on server

    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL_MS);

    // Also run cleanup immediately
    this.performCleanup();
  }

  private performCleanup() {
    const store = useEnvironmentStore.getState();
    const expiredEnvironments = store.getExpiredEnvironments();
    
    if (expiredEnvironments.length > 0) {
      console.log(`[EnvironmentManager] Found ${expiredEnvironments.length} expired environments`);
      
      // Auto-cleanup expired environments that are marked for auto-cleanup
      const autoCleanupEnvironments = expiredEnvironments.filter(env => 
        env.sharingStrategy === "throwaway" || 
        (env.autoExtend === false && env.sharingStrategy !== "default")
      );
      
      if (autoCleanupEnvironments.length > 0) {
        console.log(`[EnvironmentManager] Auto-cleaning up ${autoCleanupEnvironments.length} environments`);
        autoCleanupEnvironments.forEach(env => {
          store.deleteEnvironment(env.id);
        });
      }
    }
  }

  public extendEnvironmentIfNeeded(environmentId: string): boolean {
    const store = useEnvironmentStore.getState();
    const environment = store.listEnvironments().find(env => env.id === environmentId);
    
    if (!environment) return false;
    
    const now = new Date();
    const isExpiringSoon = environment.expiresAt && 
      environment.expiresAt < new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
    
    if (environment.autoExtend && isExpiringSoon) {
      console.log(`[EnvironmentManager] Auto-extending environment ${environment.name}`);
      return store.extendEnvironment(environmentId, environment.extensionHours);
    }
    
    return false;
  }

  public markEnvironmentUsed(environmentId: string): void {
    const store = useEnvironmentStore.getState();
    store.markEnvironmentUsed(environmentId);
    
    // Try to auto-extend if needed
    this.extendEnvironmentIfNeeded(environmentId);
  }

  public getEnvironmentHealth(): {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number;
  } {
    const store = useEnvironmentStore.getState();
    const environments = store.listEnvironments();
    const now = new Date();
    const expiringSoonThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    return {
      total: environments.length,
      active: environments.filter(env => env.isActive).length,
      expired: environments.filter(env => env.expiresAt && env.expiresAt < now).length,
      expiringSoon: environments.filter(env => 
        env.expiresAt && 
        env.expiresAt > now && 
        env.expiresAt < expiringSoonThreshold
      ).length,
    };
  }

  public stopCleanupTimer() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// React hook for using the environment manager
export function useEnvironmentManager() {
  // Only create manager in browser environment
  if (typeof window === 'undefined') {
    return {
      markUsed: (environmentId: string) => {},
      extendIfNeeded: (environmentId: string) => false,
      getHealth: () => ({ total: 0, active: 0, expired: 0, expiringSoon: 0 }),
    };
  }
  
  const manager = EnvironmentManager.getInstance();
  
  return {
    markUsed: (environmentId: string) => manager.markEnvironmentUsed(environmentId),
    extendIfNeeded: (environmentId: string) => manager.extendEnvironmentIfNeeded(environmentId),
    getHealth: () => manager.getEnvironmentHealth(),
  };
}