import ClaudeAuthHelper from './claude-auth-helper.js';

/**
 * Factory for creating agent-specific auth helpers.
 * Implements early detection pattern to avoid unnecessary processing.
 */
export class AuthHelperFactory {
  
  /**
   * Get auth helper for agent if supported and has credentials
   * @param {string} agentName - Name of the agent
   * @returns {Promise<Object|null>} Auth helper class or null
   */
  static async getAuthHelper(agentName) {
    switch (agentName) {
      case 'claude':
        if (await ClaudeAuthHelper.hasCredentials()) {
          return ClaudeAuthHelper;
        }
        return null;
        
      // Future agents can be added here:
      // case 'gemini':
      //   if (await GeminiAuthHelper.hasCredentials()) {
      //     return GeminiAuthHelper;
      //   }
      //   return null;
        
      default:
        return null;
    }
  }
  
  /**
   * Check if agent supports authentication
   * @param {string} agentName - Name of the agent
   * @returns {boolean} True if agent supports auth
   */
  static supportsAuthentication(agentName) {
    return ['claude'].includes(agentName);
    // Future: return ['claude', 'gemini', 'openai'].includes(agentName);
  }
  
  /**
   * Get authentication status for any agent
   * @param {string} agentName - Name of the agent
   * @returns {Promise<Object>} Status information
   */
  static async getAuthStatus(agentName) {
    if (!this.supportsAuthentication(agentName)) {
      return {
        supported: false,
        authenticated: false,
        message: `Authentication not yet implemented for ${agentName}`
      };
    }
    
    const authHelper = await this.getAuthHelper(agentName);
    if (!authHelper) {
      return {
        supported: true,
        authenticated: false,
        message: 'Not authenticated'
      };
    }
    
    return await authHelper.getAuthStatus();
  }
}

export default AuthHelperFactory;