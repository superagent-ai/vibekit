# OAuth Token Usage Across Multiple Instances

When using VibeKit across multiple instances (e.g., CI/CD, different machines, containers), you have several options for sharing OAuth tokens.

## Option 1: Environment Variable (Recommended for CI/CD)

After authenticating on your local machine:

```bash
# 1. Login locally
vibekit auth login claude

# 2. Export token in environment variable format
vibekit auth export claude --format env
# Output: export CLAUDE_CODE_OAUTH_TOKEN="your-access-token-here"

# 3. Set this on other instances
export CLAUDE_CODE_OAUTH_TOKEN="your-access-token-here"

# 4. Import from environment variable
vibekit auth import claude --env
```

**Pros:**
- Simple and secure
- Works well with CI/CD systems
- No file system dependencies

**Cons:**
- Access token expires (typically in a few hours)
- Cannot auto-refresh without refresh token

## Option 2: Refresh Token (Recommended for Long-term Use)

Use refresh tokens for persistent authentication:

```bash
# On source machine
# 1. Export refresh token only
vibekit auth export claude --format refresh
# Output: your-refresh-token-here

# On target machine
# 2. Import using refresh token
vibekit auth import claude --refresh your-refresh-token-here

# 3. Verify authentication
vibekit auth verify claude
```

**Pros:**
- Refresh tokens last much longer
- Automatic token renewal
- More secure than sharing access tokens

**Cons:**
- Still need secure token transfer

## Option 3: Token File Sharing

Export and import complete token data:

```bash
# On source machine
# 1. Export full token data
vibekit auth export claude --format full > token.json

# On target machine
# 2. Import from file
vibekit auth import claude --file token.json

# Alternative: Manual file copy
cp ~/.vibekit/claude-oauth-token.json /path/to/backup/
# Then restore on target machine
```

**Pros:**
- Includes refresh token for auto-renewal
- Works exactly like local authentication
- Complete token backup

**Cons:**
- Manual file management
- Security considerations for file transfer

## Option 4: Shared Secret Store

For production environments, use a secret management service:

```javascript
// Example with AWS Secrets Manager
const AWS = require('aws-sdk');
const { ClaudeAuth } = require('@vibe-kit/sdk/auth');
const secretsManager = new AWS.SecretsManager();

async function getOAuthToken() {
  const secret = await secretsManager.getSecretValue({
    SecretId: 'vibekit/claude-oauth-token'
  }).promise();
  
  const tokenData = JSON.parse(secret.SecretString);
  
  // Import token using library API
  await ClaudeAuth.importToken({ 
    tokenData: tokenData 
  });
  
  // Get valid token (auto-refreshes if needed)
  return await ClaudeAuth.getValidToken();
}

// Use with VibeKit
const token = await getOAuthToken();
const vibeKit = new VibeKit()
  .withAgent({
    type: "claude",
    provider: "anthropic",
    oauthToken: token,
    model: "claude-sonnet-4-20250514",
  });
```

## Option 5: Service Account / API Key

For long-running services, consider using traditional API keys instead:

```bash
export ANTHROPIC_API_KEY="your-api-key"
```

This avoids OAuth token expiration issues entirely.

## Best Practices

1. **Development**: Use local file storage with `vibekit auth login`
2. **CI/CD**: Use environment variables or refresh tokens
3. **Production**: Use secret management services or API keys
4. **Containers**: Mount token file as a secret volume or use environment variables
5. **Multi-instance**: Use refresh tokens for long-term access

## CLI Commands Summary

```bash
# Authentication
vibekit auth login claude                      # Interactive OAuth login
vibekit auth logout claude                     # Clear saved authentication
vibekit auth status claude                     # Check authentication status
vibekit auth verify claude                     # Verify token with API call

# Export tokens
vibekit auth export claude --format env        # Environment variable format
vibekit auth export claude --format json       # JSON format (access token only)
vibekit auth export claude --format full       # Complete token data
vibekit auth export claude --format refresh    # Refresh token only

# Import tokens
vibekit auth import claude --env               # From environment variable
vibekit auth import claude --token <token>     # Access token string
vibekit auth import claude --refresh <token>   # Refresh token (exchanges for access)
vibekit auth import claude --file <file>       # From JSON file
```

## Library API Usage

```javascript
import { ClaudeAuth } from '@vibe-kit/sdk/auth';

// Authenticate
const token = await ClaudeAuth.authenticate();

// Check status
const status = await ClaudeAuth.getStatus();
console.log('Authenticated:', status.authenticated);
console.log('Expires at:', status.expiresAt);

// Verify authentication
const isValid = await ClaudeAuth.verify();
const details = await ClaudeAuth.verifyWithDetails();

// Export tokens
const envToken = await ClaudeAuth.exportToken('env');
const fullToken = await ClaudeAuth.exportToken('full');

// Import tokens
await ClaudeAuth.importToken({ fromEnv: true });
await ClaudeAuth.importToken({ fromFile: './token.json' });
await ClaudeAuth.importToken({ refreshToken: 'your-refresh-token' });

// Get valid token (auto-refreshes)
const accessToken = await ClaudeAuth.getValidToken();
```

## Security Considerations

- Never commit tokens to version control
- Use encrypted channels when transferring tokens
- Rotate tokens regularly
- Consider token scope and permissions
- Monitor token usage for anomalies
- Store refresh tokens securely (they have long-term access)