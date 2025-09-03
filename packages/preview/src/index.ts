// Main exports for @vibe-kit/preview package

// Services (main API)
export { PreviewService } from './services/PreviewService.js';

// Core managers
export { DevServerManager } from './manager/DevServerManager.js';

// Detectors
export { SimpleProjectDetector } from './detector/SimpleProjectDetector.js';

// Utilities
export { PortUtils } from './utils/port.js';

// Types
export type {
  ProjectType,
  DevServerStatus,
  DevServerConfig,
  DevServerInstance,
  DevServerLog,
  ProjectDetectionResult,
  PreviewOptions
} from './types/index.js';

// Re-export the static server path for direct usage if needed
export const STATIC_SERVER_PATH = './server/StaticServer.js';