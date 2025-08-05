// Provider enums
export enum SANDBOX_PROVIDERS {
  CLOUDFLARE = "Cloudflare",
  DAGGER = "Dagger",
  DAYTONA = "Daytona",
  E2B = "E2B",
  NORTHFLANK = "Northflank",
}

// Provider type constants
export const PROVIDER_TYPES = {
  CLOUDFLARE: 'cloudflare',
  DAGGER: 'dagger',
  DAYTONA: 'daytona',
  E2B: 'e2b',
  NORTHFLANK: 'northflank',
} as const;

export type ProviderType = typeof PROVIDER_TYPES[keyof typeof PROVIDER_TYPES];

// Provider configurations with display names and descriptions
export const PROVIDER_TEMPLATES = [
  {
    name: PROVIDER_TYPES.CLOUDFLARE,
    display: "Cloudflare",
    message: "Cloudflare - Edge computing and serverless platform",
  },
  {
    name: PROVIDER_TYPES.DAGGER,
    display: "Dagger",
    message: "Dagger - Container-based CI/CD platform",
  },
  {
    name: PROVIDER_TYPES.DAYTONA,
    display: "Daytona",
    message: "Daytona - Development environment orchestration platform",
  },
  {
    name: PROVIDER_TYPES.E2B,
    display: "E2B",
    message: "E2B - Cloud development sandbox platform",
  },
  {
    name: PROVIDER_TYPES.NORTHFLANK,
    display: "Northflank",
    message: "Northflank - Cloud deployment and infrastructure platform",
  },
];

// Provider display names mapping
export const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
  [PROVIDER_TYPES.CLOUDFLARE]: 'Cloudflare',
  [PROVIDER_TYPES.DAGGER]: 'Dagger',
  [PROVIDER_TYPES.DAYTONA]: 'Daytona',
  [PROVIDER_TYPES.E2B]: 'E2B',
  [PROVIDER_TYPES.NORTHFLANK]: 'Northflank',
};

// Provider descriptions mapping
export const PROVIDER_DESCRIPTIONS: Record<ProviderType, string> = {
  [PROVIDER_TYPES.CLOUDFLARE]: "Edge computing and serverless platform",
  [PROVIDER_TYPES.DAGGER]: "Container-based CI/CD platform",
  [PROVIDER_TYPES.DAYTONA]: "Development environment orchestration platform",
  [PROVIDER_TYPES.E2B]: "Cloud development sandbox platform",
  [PROVIDER_TYPES.NORTHFLANK]: "Cloud deployment and infrastructure platform",
};