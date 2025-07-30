/**
 * Sandbox provider definitions and configurations
 * Central source of truth for all sandbox providers across VibeKit
 */

// Sandbox provider type definition - single source of truth
export type SandboxProviderType = "dagger" | "e2b" | "daytona" | "northflank" | "cloudflare";

// Provider metadata for display purposes
export interface SandboxProviderMetadata {
  name: SandboxProviderType;
  display: string;
  description: string;
  requiresApiKey: boolean;
  supportsLocal?: boolean;
  supportsCloud?: boolean;
}

// Complete provider configurations
export const SANDBOX_PROVIDER_CONFIGS: Record<SandboxProviderType, SandboxProviderMetadata> = {
  dagger: {
    name: "dagger",
    display: "Dagger",
    description: "Local containerized development using Dagger",
    requiresApiKey: false,
    supportsLocal: true,
    supportsCloud: false
  },
  e2b: {
    name: "e2b",
    display: "E2B",
    description: "Cloud-based isolated sandboxes with E2B",
    requiresApiKey: true,
    supportsLocal: false,
    supportsCloud: true
  },
  daytona: {
    name: "daytona",
    display: "Daytona",
    description: "Development environments powered by Daytona",
    requiresApiKey: true,
    supportsLocal: true,
    supportsCloud: true
  },
  northflank: {
    name: "northflank",
    display: "Northflank",
    description: "Cloud platform for running containerized workloads",
    requiresApiKey: true,
    supportsLocal: false,
    supportsCloud: true
  },
  cloudflare: {
    name: "cloudflare",
    display: "Cloudflare",
    description: "Edge computing with Cloudflare Workers",
    requiresApiKey: false, // Uses Worker bindings instead
    supportsLocal: false,
    supportsCloud: true
  }
};

// Helper to get all provider types as an array
export const SANDBOX_PROVIDER_TYPES: SandboxProviderType[] = Object.keys(SANDBOX_PROVIDER_CONFIGS) as SandboxProviderType[];

// Enum-style constants for backwards compatibility
export const SANDBOX_PROVIDERS = {
  DAGGER: "Dagger",
  E2B: "E2B",
  DAYTONA: "Daytona",
  NORTHFLANK: "Northflank",
  CLOUDFLARE: "Cloudflare"
} as const;