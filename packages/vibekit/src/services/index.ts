/**
 * Services Module
 * 
 * Provides provider-agnostic infrastructure services for VibeKit including
 * Docker client operations, configuration management, and telemetry.
 */

export { DockerClient, type DockerLoginInfo, type DockerClientConfig } from './docker-client';
export { ConfigManager, type VibeKitConfig, type ConfigManagerOptions, type AgentType } from './config-manager';
export { TelemetryService, type TelemetryData } from './telemetry';