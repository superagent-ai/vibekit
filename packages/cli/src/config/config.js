import fs from 'fs-extra';
import path from 'path';
import os from 'os';

class Config {
  constructor() {
    this.configDir = path.join(os.homedir(), '.vibekit');
    this.configFile = path.join(this.configDir, 'config.json');
    this.defaultConfig = {
      agents: {
        claude: {
          command: 'claude',
          args: [],
          env: {}
        },
        gemini: {
          command: 'gemini',
          args: [],
          env: {}
        }
      },
      logging: {
        level: 'info',
        debug: false,
        retention: {
          days: 30,
          maxFiles: 100
        }
      },
      ui: {
        colors: true,
        verbose: false,
        showProgress: true
      }
    };
    this.config = null;
  }

  async load() {
    await fs.ensureDir(this.configDir);
    
    if (await fs.pathExists(this.configFile)) {
      try {
        this.config = await fs.readJson(this.configFile);
        this.config = this.mergeConfig(this.defaultConfig, this.config);
      } catch (error) {
        console.warn('Failed to parse config file, using defaults');
        this.config = this.defaultConfig;
      }
    } else {
      this.config = this.defaultConfig;
      await this.save();
    }

    return this.config;
  }

  async save() {
    if (!this.config) {
      this.config = this.defaultConfig;
    }
    
    await fs.ensureDir(this.configDir);
    await fs.writeJson(this.configFile, this.config, { spaces: 2 });
  }

  get(key) {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  set(key, value) {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    
    const keys = key.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  getAgentConfig(agentName) {
    return this.get(`agents.${agentName}`) || {
      command: agentName,
      args: [],
      env: {}
    };
  }

  setAgentConfig(agentName, config) {
    this.set(`agents.${agentName}`, config);
  }

  mergeConfig(defaults, userConfig) {
    const result = { ...defaults };
    
    for (const key in userConfig) {
      if (userConfig[key] && typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
        result[key] = this.mergeConfig(defaults[key] || {}, userConfig[key]);
      } else {
        result[key] = userConfig[key];
      }
    }
    
    return result;
  }

  async reset() {
    this.config = this.defaultConfig;
    await this.save();
  }

  getConfigPath() {
    return this.configFile;
  }

  validate() {
    if (!this.config) {
      throw new Error('Config not loaded');
    }

    const requiredKeys = ['agents', 'logging', 'ui'];
    
    for (const key of requiredKeys) {
      if (!(key in this.config)) {
        throw new Error(`Missing required config key: ${key}`);
      }
    }

    for (const agentName in this.config.agents) {
      const agent = this.config.agents[agentName];
      
      if (!agent.command) {
        throw new Error(`Agent ${agentName} missing command`);
      }
      
      if (!Array.isArray(agent.args)) {
        throw new Error(`Agent ${agentName} args must be an array`);
      }
    }

    return true;
  }
}

export default Config;