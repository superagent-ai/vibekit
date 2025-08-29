import path from 'path';
import os from 'os';

export const VIBEKIT_DIR = path.join(os.homedir(), '.vibekit');
export const PROJECTS_FILE = path.join(VIBEKIT_DIR, 'projects.json');
export const PROJECTS_VERSION = '1.0.0';

export const DEFAULT_PROJECTS_CONFIG = {
  version: PROJECTS_VERSION,
  projects: {}
};