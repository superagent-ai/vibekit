import { create } from "zustand";
import { persist } from "zustand/middleware";

export type EnvironmentSharingStrategy = 
  | "default"     // Single persistent environment used across all repos
  | "per-repo"    // One environment per repository
  | "throwaway"   // New environment for each task
  | "manual"      // User manually manages environment lifecycle

export interface Environment {
  id: string;
  name: string;
  description: string;
  githubOrganization: string;
  githubToken: string;
  githubRepository: string;
  createdAt: Date;
  updatedAt: Date;
  
  // New fields for expiry and sharing
  expiresAt?: Date;           // When environment expires (null = never)
  isDefault?: boolean;        // Is this the default environment
  sharingStrategy: EnvironmentSharingStrategy;
  autoExtend?: boolean;       // Auto-extend on use
  extensionHours?: number;    // Hours to extend by (default 1)
  maxExtensions?: number;     // Max number of extensions (null = unlimited)
  extensionCount?: number;    // Current extension count
  lastUsedAt?: Date;          // Last time environment was used
  isActive?: boolean;         // Is environment currently active/healthy
  
  // Optional sandbox configuration
  sandboxConfig?: {
    template?: string;        // E2B template to use (when creating new sandbox)
    existingSandboxId?: string; // Use existing sandbox instead of creating new one
    timeoutMs?: number;       // Custom timeout (max 1 hour for E2B)
    environment?: Record<string, string>; // Environment variables
    forceRegenerate?: boolean; // Force regenerate sandbox even if one exists
    
    // Desktop-specific configuration
    useDesktop?: boolean;     // Use desktop sandbox instead of code-interpreter
    desktopConfig?: {
      resolution?: string;    // Screen resolution (e.g., "1920x1080")
      browser?: "chrome" | "firefox"; // Default browser
      enableVSCode?: boolean; // Enable VS Code web interface
      enableDevTools?: boolean; // Enable browser dev tools
      streamQuality?: "low" | "medium" | "high"; // Stream quality
      frameRate?: number;     // Stream frame rate (fps)
      mouseControl?: boolean; // Enable mouse control
      keyboardControl?: boolean; // Enable keyboard control
      recordSession?: boolean; // Record desktop session
    };
  };
}

interface EnvironmentStore {
  environments: Environment[];
  createEnvironment: (
    environment: Omit<Environment, "id" | "createdAt" | "updatedAt">
  ) => void;
  updateEnvironment: (
    id: string,
    updates: Partial<Omit<Environment, "id" | "createdAt" | "updatedAt">>
  ) => void;
  deleteEnvironment: (id: string) => void;
  listEnvironments: () => Environment[];
  
  // New methods for expiry and sharing
  getDefaultEnvironment: () => Environment | null;
  setDefaultEnvironment: (id: string) => void;
  extendEnvironment: (id: string, hours?: number) => boolean; // Returns false if max extensions reached
  markEnvironmentUsed: (id: string) => void;
  getExpiredEnvironments: () => Environment[];
  cleanupExpiredEnvironments: () => void;
  getEnvironmentForRepository: (repository: string) => Environment | null;
  findOrCreateEnvironmentForTask: (repository: string, strategy: EnvironmentSharingStrategy) => Promise<Environment>;
}

export const useEnvironmentStore = create<EnvironmentStore>()(
  persist(
    (set, get) => ({
      environments: [],

      createEnvironment: (environment) => {
        const now = new Date();
        const newEnvironment = {
          ...environment,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          sharingStrategy: environment.sharingStrategy || "manual",
          autoExtend: environment.autoExtend ?? false,
          extensionHours: environment.extensionHours ?? 1,
          extensionCount: 0,
          isActive: true,
        };
        set((state) => ({
          environments: [...state.environments, newEnvironment],
        }));
      },

      updateEnvironment: (id, updates) => {
        set((state) => ({
          environments: state.environments.map((env) =>
            env.id === id ? { ...env, ...updates, updatedAt: new Date() } : env
          ),
        }));
      },

      deleteEnvironment: (id) => {
        set((state) => ({
          environments: state.environments.filter((env) => env.id !== id),
        }));
      },

      listEnvironments: () => get().environments,
      
      // New methods for expiry and sharing
      getDefaultEnvironment: () => {
        return get().environments.find(env => env.isDefault) || null;
      },
      
      setDefaultEnvironment: (id) => {
        set((state) => ({
          environments: state.environments.map((env) => ({
            ...env,
            isDefault: env.id === id,
            updatedAt: new Date(),
          })),
        }));
      },
      
      extendEnvironment: (id, hours = 1) => {
        const environment = get().environments.find(env => env.id === id);
        if (!environment) return false;
        
        const maxExtensions = environment.maxExtensions;
        const currentExtensions = environment.extensionCount || 0;
        
        if (maxExtensions && currentExtensions >= maxExtensions) {
          return false; // Max extensions reached
        }
        
        const now = new Date();
        const newExpiresAt = new Date(
          (environment.expiresAt || now).getTime() + (hours * 60 * 60 * 1000)
        );
        
        set((state) => ({
          environments: state.environments.map((env) =>
            env.id === id 
              ? { 
                  ...env, 
                  expiresAt: newExpiresAt,
                  extensionCount: currentExtensions + 1,
                  updatedAt: now,
                }
              : env
          ),
        }));
        
        return true;
      },
      
      markEnvironmentUsed: (id) => {
        const now = new Date();
        set((state) => ({
          environments: state.environments.map((env) =>
            env.id === id 
              ? { 
                  ...env, 
                  lastUsedAt: now,
                  updatedAt: now,
                }
              : env
          ),
        }));
      },
      
      getExpiredEnvironments: () => {
        const now = new Date();
        return get().environments.filter(env => 
          env.expiresAt && env.expiresAt < now
        );
      },
      
      cleanupExpiredEnvironments: () => {
        const now = new Date();
        set((state) => ({
          environments: state.environments.filter(env => 
            !env.expiresAt || env.expiresAt >= now
          ),
        }));
      },
      
      getEnvironmentForRepository: (repository) => {
        return get().environments.find(env => 
          env.githubRepository === repository && 
          env.sharingStrategy === "per-repo" &&
          env.isActive
        ) || null;
      },
      
      findOrCreateEnvironmentForTask: async (repository, strategy) => {
        const state = get();
        const now = new Date();
        
        switch (strategy) {
          case "default": {
            const defaultEnv = state.environments.find(env => env.isDefault);
            if (defaultEnv) {
              // Auto-extend if configured and not expired
              if (defaultEnv.autoExtend && defaultEnv.expiresAt && defaultEnv.expiresAt < now) {
                get().extendEnvironment(defaultEnv.id, defaultEnv.extensionHours);
              }
              get().markEnvironmentUsed(defaultEnv.id);
              return defaultEnv;
            }
            throw new Error("No default environment configured");
          }
          
          case "per-repo": {
            let repoEnv = state.environments.find(env => 
              env.githubRepository === repository && 
              env.sharingStrategy === "per-repo"
            );
            
            if (repoEnv) {
              // Auto-extend if configured and not expired
              if (repoEnv.autoExtend && repoEnv.expiresAt && repoEnv.expiresAt < now) {
                get().extendEnvironment(repoEnv.id, repoEnv.extensionHours);
              }
              get().markEnvironmentUsed(repoEnv.id);
              return repoEnv;
            }
            
            throw new Error(`No environment configured for repository: ${repository}`);
          }
          
          case "throwaway": {
            // For throwaway environments, we don't actually create them here
            // They should be created dynamically during task execution
            throw new Error("Throwaway environments must be created dynamically");
          }
          
          case "manual":
          default: {
            throw new Error("Manual environment selection required");
          }
        }
      },
    }),
    {
      name: "environments",
      // Custom serialization to handle Date objects
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          
          const parsed = JSON.parse(str);
          // Convert date strings back to Date objects
          if (parsed.state?.environments) {
            parsed.state.environments = parsed.state.environments.map((env: any) => ({
              ...env,
              createdAt: env.createdAt ? new Date(env.createdAt) : new Date(),
              updatedAt: env.updatedAt ? new Date(env.updatedAt) : new Date(),
              expiresAt: env.expiresAt ? new Date(env.expiresAt) : undefined,
              lastUsedAt: env.lastUsedAt ? new Date(env.lastUsedAt) : undefined,
            }));
          }
          return parsed;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);