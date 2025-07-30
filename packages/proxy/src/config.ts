import { readFileSync, existsSync } from 'fs'
import { watch } from 'chokidar'
import yaml from 'js-yaml'
import pino from 'pino'
import { RedactionConfig, RedactionRule } from './types.js'

export class ConfigLoader {
  private configPath: string
  private logger: pino.Logger
  private watchers: any[] = []
  private onConfigChange?: (rules: RedactionRule[]) => void

  constructor(configPath: string, logger: pino.Logger) {
    this.configPath = configPath
    this.logger = logger
  }

  loadConfig(): RedactionRule[] {
    try {
      if (!existsSync(this.configPath)) {
        this.logger.warn({ configPath: this.configPath }, 'Config file not found, using default rules')
        return this.getDefaultRules()
      }

      const configContent = readFileSync(this.configPath, 'utf8')
      const config = yaml.load(configContent) as RedactionConfig

      if (!config || !config.secrets) {
        this.logger.warn('Invalid config format, using default rules')
        return this.getDefaultRules()
      }

      const rules = this.parseConfig(config)
      this.logger.info({ rulesCount: rules.length }, 'Config loaded successfully')
      return rules
    } catch (error) {
      this.logger.error({ error, configPath: this.configPath }, 'Failed to load config, using default rules')
      return this.getDefaultRules()
    }
  }

  private parseConfig(config: RedactionConfig): RedactionRule[] {
    const rules: RedactionRule[] = []

    // Process environment variable patterns
    if (config.secrets.env_vars) {
      for (const envVar of config.secrets.env_vars) {
        rules.push({
          name: envVar,
          type: 'env_var',
          value: envVar
        })
      }
    }

    // Process regex patterns
    if (config.secrets.patterns) {
      for (const pattern of config.secrets.patterns) {
        try {
          rules.push({
            name: pattern.name,
            type: 'pattern',
            value: pattern.regex,
            regex: new RegExp(pattern.regex, 'g')
          })
        } catch (error) {
          this.logger.warn({ pattern: pattern.name, regex: pattern.regex }, 'Invalid regex pattern, skipping')
        }
      }
    }

    return rules
  }

  private getDefaultRules(): RedactionRule[] {
    const defaultEnvVars = [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'DATABASE_URL',
      'DATABASE_PASSWORD',
      'JWT_SECRET',
      'SECRET_KEY',
      'API_KEY',
      'GCP_*',
      'AZURE_*',
      'GITHUB_TOKEN'
    ]

    const defaultPatterns = [
      {
        name: 'aws_access_key',
        regex: 'AKIA[0-9A-Z]{16}'
      },
      {
        name: 'aws_secret_key',
        regex: '[A-Za-z0-9/+=]{40}'
      },
      {
        name: 'jwt_token',
        regex: 'eyJ[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+'
      },
      {
        name: 'github_token',
        regex: 'ghp_[A-Za-z0-9]{36}'
      },
      {
        name: 'generic_api_key',
        regex: '[a-zA-Z0-9]{32,}'
      }
    ]

    const rules: RedactionRule[] = []

    // Add default env vars
    for (const envVar of defaultEnvVars) {
      rules.push({
        name: envVar,
        type: 'env_var',
        value: envVar
      })
    }

    // Add default patterns
    for (const pattern of defaultPatterns) {
      try {
        rules.push({
          name: pattern.name,
          type: 'pattern',
          value: pattern.regex,
          regex: new RegExp(pattern.regex, 'g')
        })
      } catch (error) {
        this.logger.warn({ pattern: pattern.name }, 'Invalid default regex pattern')
      }
    }

    return rules
  }

  setupHotReload(callback: (rules: RedactionRule[]) => void): void {
    this.onConfigChange = callback

    // Watch for file changes
    const watcher = watch(this.configPath, {
      ignoreInitial: true,
      persistent: true
    })

    watcher.on('change', () => {
      this.logger.info('Config file changed, reloading...')
      try {
        const newRules = this.loadConfig()
        this.onConfigChange?.(newRules)
        this.logger.info('Config reloaded successfully')
      } catch (error) {
        this.logger.error({ error }, 'Failed to reload config')
      }
    })

    this.watchers.push(watcher)

    // Handle SIGHUP for manual reload
    process.on('SIGHUP', () => {
      this.logger.info('SIGHUP received, reloading config...')
      try {
        const newRules = this.loadConfig()
        this.onConfigChange?.(newRules)
        this.logger.info('Config reloaded via SIGHUP')
      } catch (error) {
        this.logger.error({ error }, 'Failed to reload config via SIGHUP')
      }
    })
  }

  close(): void {
    for (const watcher of this.watchers) {
      watcher.close()
    }
    this.watchers = []
  }
}

export function createDefaultConfig(): string {
  return `# Proxy Redaction Configuration
secrets:
  # Environment variables to redact (supports wildcards)
  env_vars:
    - "AWS_*"
    - "GCP_*"
    - "AZURE_*"
    - "OPENAI_API_KEY"
    - "ANTHROPIC_API_KEY"
    - "DATABASE_URL"
    - "DATABASE_PASSWORD"
    - "JWT_SECRET"
    - "SECRET_KEY"
    - "API_KEY"
    - "GITHUB_TOKEN"

  # Regex patterns for detecting secrets
  patterns:
    - name: "aws_access_key"
      regex: "AKIA[0-9A-Z]{16}"
    
    - name: "aws_secret_key"
      regex: "[A-Za-z0-9/+=]{40}"
    
    - name: "jwt_token"
      regex: "eyJ[A-Za-z0-9-_]+\\\\.[A-Za-z0-9-_]+\\\\.[A-Za-z0-9-_]+"
    
    - name: "github_token"
      regex: "ghp_[A-Za-z0-9]{36}"
    
    - name: "generic_api_key_32"
      regex: "[a-zA-Z0-9]{32}"
    
    - name: "generic_api_key_64"
      regex: "[a-zA-Z0-9]{64}"
`
}