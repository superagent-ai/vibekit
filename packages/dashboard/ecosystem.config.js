/**
 * PM2 Configuration for VibeKit Dashboard
 * 
 * This file configures PM2 for production deployment with:
 * - Cluster mode for high availability
 * - Auto-restart on failure
 * - Log management
 * - Environment-specific settings
 * - Graceful reload support
 */

module.exports = {
  apps: [{
    // Application Configuration
    name: 'vibekit-dashboard',
    script: './server.js',
    cwd: '/home/vibekit/packages/dashboard',
    
    // Cluster Mode Configuration
    instances: process.env.PM2_INSTANCES || 2,
    exec_mode: 'cluster',
    
    // Memory Management
    max_memory_restart: process.env.MAX_MEMORY || '2G',
    
    // Restart Policy
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Graceful Shutdown
    kill_timeout: 30000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Logging Configuration
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Node.js Arguments
    node_args: [
      '--max-old-space-size=4096',
      '--optimize-for-size',
      '--gc-interval=100'
    ],
    
    // Environment Variables
    env: {
      NODE_ENV: 'development',
      PORT: 3001,
      HOST: '127.0.0.1',
      ENABLE_MONITORING: false,
      LOG_LEVEL: 'debug'
    },
    
    env_staging: {
      NODE_ENV: 'staging',
      PORT: process.env.PORT || 3001,
      HOST: '0.0.0.0',
      ENABLE_MONITORING: true,
      ENABLE_MEMORY_MONITOR: true,
      ENABLE_DISK_MONITOR: true,
      MEMORY_CHECK_INTERVAL: 60000,
      DISK_CHECK_INTERVAL: 120000,
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'json',
      SESSION_SECRET: process.env.SESSION_SECRET,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      RATE_LIMIT_MAX: 60,
      MAX_HEAP_SIZE: 2048
    },
    
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3001,
      HOST: '0.0.0.0',
      ENABLE_MONITORING: true,
      ENABLE_MEMORY_MONITOR: true,
      ENABLE_DISK_MONITOR: true,
      MEMORY_CHECK_INTERVAL: 30000,
      DISK_CHECK_INTERVAL: 60000,
      LOG_LEVEL: 'warn',
      LOG_FORMAT: 'json',
      SESSION_SECRET: process.env.SESSION_SECRET,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      RATE_LIMIT_MAX: 30,
      MAX_HEAP_SIZE: 4096,
      
      // Production-specific
      ENABLE_RATE_LIMIT: true,
      ENABLE_CSRF: true,
      ENABLE_HELMET: true,
      COMPRESS_RESPONSES: true,
      CACHE_STATIC_ASSETS: true,
      
      // Feature flags
      ENABLE_SANDBOX: process.env.ENABLE_SANDBOX !== 'false',
      ENABLE_PROXY: process.env.ENABLE_PROXY !== 'false',
      ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS !== 'false',
      ENABLE_MCP: process.env.ENABLE_MCP !== 'false',
      ENABLE_PROJECTS: process.env.ENABLE_PROJECTS !== 'false',
      ENABLE_CHAT: process.env.ENABLE_CHAT !== 'false',
      
      // API Keys (from environment)
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GROK_API_KEY: process.env.GROK_API_KEY
    },
    
    // Advanced Options
    post_update: ['npm install', 'npm run build'],
    
    // Monitoring
    instance_var: 'INSTANCE_ID',
    
    // Cluster Events
    events: {
      restart: 'npm run notify:restart',
      stop: 'npm run notify:stop',
      exit: 'npm run notify:exit',
      'restart overlimit': 'npm run notify:overlimit'
    }
  }],
  
  // Deploy Configuration (optional)
  deploy: {
    production: {
      user: 'vibekit',
      host: ['production-server-1', 'production-server-2'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/vibekit.git',
      path: '/home/vibekit/production',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm ci --production && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p logs',
      ssh_options: 'StrictHostKeyChecking=no',
      env: {
        NODE_ENV: 'production'
      }
    },
    
    staging: {
      user: 'vibekit',
      host: 'staging-server',
      ref: 'origin/staging',
      repo: 'git@github.com:your-org/vibekit.git',
      path: '/home/vibekit/staging',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env staging',
      'pre-setup': 'mkdir -p logs',
      ssh_options: 'StrictHostKeyChecking=no',
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};

/**
 * PM2 Usage Examples:
 * 
 * Start in production:
 *   pm2 start ecosystem.config.js --env production
 * 
 * Start in staging:
 *   pm2 start ecosystem.config.js --env staging
 * 
 * Reload with zero downtime:
 *   pm2 reload ecosystem.config.js
 * 
 * Scale instances:
 *   pm2 scale vibekit-dashboard 4
 * 
 * Monitor:
 *   pm2 monit
 * 
 * View logs:
 *   pm2 logs vibekit-dashboard
 * 
 * Deploy to production:
 *   pm2 deploy production
 * 
 * Deploy to staging:
 *   pm2 deploy staging
 * 
 * Save configuration:
 *   pm2 save
 *   pm2 startup
 */