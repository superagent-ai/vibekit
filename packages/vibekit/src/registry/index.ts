/**
 * Registry Module
 * 
 * Provides provider-agnostic container registry operations for VibeKit,
 * supporting multiple registry providers and image resolution strategies.
 */

export { DockerHubRegistry, type DockerHubConfig } from './docker-hub';
export { 
  RegistryManager, 
  type RegistryProvider, 
  type RegistryResult, 
  type ImageUploadResult, 
  type RegistryManagerConfig 
} from './registry-manager';
export { ImageResolver, type ImageResolverConfig } from './image-resolver';