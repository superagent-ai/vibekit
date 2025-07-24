import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { authenticate, clearToken, loadToken, getValidToken, saveToken } from "../../auth/oauth.js";

export function createAuthCommand(): Command {
  const authCommand = new Command("auth")
    .description("Manage authentication for AI providers");
  
  // Add login command
  authCommand
    .command("login <provider>")
    .description("Authenticate with a provider using OAuth")
    .action(async (provider: string) => {
      if (provider !== "claude") {
        console.error(chalk.red(`Unknown provider: ${provider}`));
        console.log(chalk.gray("Currently supported providers: claude"));
        process.exit(1);
      }
      const spinner = ora("Checking current authentication status...").start();
      
      try {
        // Check if already authenticated
        const existingToken = await getValidToken();
        if (existingToken) {
          spinner.succeed("You are already authenticated with Claude!");
          console.log(chalk.gray("Use 'vibekit auth logout claude' to sign out."));
          return;
        }
        
        spinner.stop();
        
        // Start OAuth flow
        const token = await authenticate();
        
        console.log(chalk.green("\n✅ Successfully authenticated with Claude!"));
        console.log(chalk.gray("Your OAuth token has been securely saved."));
        console.log(chalk.gray("\nYou can now use Claude Code without an API key:"));
        console.log(chalk.cyan(`
const vibeKit = new VibeKit()
  .withAgent({
    type: "claude",
    provider: "anthropic",
    // OAuth token will be used automatically
    model: "claude-sonnet-4-20250514",
  })
  .withSandbox(sandboxProvider);
        `));
      } catch (error) {
        spinner.fail("Authentication failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
  
  // Add logout command
  authCommand
    .command("logout")
    .description("Clear saved authentication")
    .argument("<provider>", "Provider to logout from (e.g., claude)")
    .action(async (provider: string) => {
      if (provider !== "claude") {
        console.error(chalk.red(`Unknown provider: ${provider}`));
        console.log(chalk.gray("Currently supported providers: claude"));
        process.exit(1);
      }
      
      const spinner = ora("Clearing authentication...").start();
      
      try {
        await clearToken();
        spinner.succeed("Successfully logged out from Claude");
      } catch (error) {
        spinner.fail("Failed to clear authentication");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
  
  // Add status command
  authCommand
    .command("status [provider]")
    .description("Check authentication status for a specific provider or all providers")
    .action(async (provider?: string) => {
      // If specific provider is requested
      if (provider) {
        if (provider !== "claude") {
          console.error(chalk.red(`Unknown provider: ${provider}`));
          console.log(chalk.gray("Currently supported providers: claude"));
          process.exit(1);
        }
        
        console.log(chalk.bold(`\n🔐 Authentication Status for ${provider}\n`));
        
        // Check Claude
        const claudeToken = await loadToken();
        if (claudeToken) {
          const validToken = await getValidToken();
          if (validToken) {
            console.log(chalk.green("✅ Authenticated"));
            console.log(chalk.gray(`Token type: ${claudeToken.token_type || "Bearer"}`));
            console.log(chalk.gray(`Scope: ${claudeToken.scope || "org:create_api_key user:profile user:inference"}`));
            if (claudeToken.expires_in) {
              const expiresAt = new Date(claudeToken.created_at + claudeToken.expires_in * 1000);
              console.log(chalk.gray(`Expires: ${expiresAt.toLocaleString()}`));
            }
          } else {
            console.log(chalk.yellow("⚠️  Token expired"));
            console.log(chalk.gray("Run 'vibekit auth login claude' to refresh"));
          }
        } else {
          console.log(chalk.gray("❌ Not authenticated"));
          console.log(chalk.gray("Run 'vibekit auth login claude' to authenticate"));
        }
      } else {
        // Show all providers status
        console.log(chalk.bold("\n🔐 Authentication Status\n"));
        
        // Check Claude
        const claudeToken = await loadToken();
        if (claudeToken) {
          const validToken = await getValidToken();
          if (validToken) {
            console.log(chalk.green("✅ Claude: Authenticated"));
            console.log(chalk.gray(`   Token type: ${claudeToken.token_type || "Bearer"}`));
            console.log(chalk.gray(`   Scope: ${claudeToken.scope || "org:create_api_key user:profile user:inference"}`));
            if (claudeToken.expires_in) {
              const expiresAt = new Date(claudeToken.created_at + claudeToken.expires_in * 1000);
              console.log(chalk.gray(`   Expires: ${expiresAt.toLocaleString()}`));
            }
          } else {
            console.log(chalk.yellow("⚠️  Claude: Token expired (run 'vibekit auth login claude' to refresh)"));
          }
        } else {
          console.log(chalk.gray("❌ Claude: Not authenticated"));
        }
        
        console.log(chalk.gray("\nUse 'vibekit auth login <provider>' to authenticate."));
      }
    });
  
  // Add verify command
  authCommand
    .command("verify <provider>")
    .description("Verify authentication by making a test API call")
    .action(async (provider: string) => {
      if (provider !== "claude") {
        console.error(chalk.red(`Unknown provider: ${provider}`));
        console.log(chalk.gray("Currently supported providers: claude"));
        process.exit(1);
      }
      
      const spinner = ora("Verifying authentication...").start();
      
      try {
        // Check if authenticated
        const accessToken = await getValidToken();
        if (!accessToken) {
          spinner.fail("Not authenticated");
          console.log(chalk.gray("Run 'vibekit auth login claude' to authenticate first."));
          process.exit(1);
        }
        
        spinner.text = "Making test API call...";
        
        // Make a test API call to Claude
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "oauth-2025-04-20",
            "Authorization": `Bearer ${accessToken}`,
            "X-API-Key": "", // Important: Override automatic API key header
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 10,
            system: "You are Claude Code, Anthropic's official CLI for Claude.",
            messages: [
              {
                role: "user",
                content: "Reply with 'OK' only."
              }
            ]
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          spinner.succeed("Authentication verified successfully!");
          console.log(chalk.green("✅ Your OAuth token is valid and working."));
          console.log(chalk.gray(`Test response: ${data.content[0].text}`));
        } else {
          const error = await response.text();
          spinner.fail("Authentication verification failed");
          console.error(chalk.red(`API Error: ${response.status} ${error}`));
          
          if (response.status === 401) {
            console.log(chalk.yellow("\nYour token may have expired. Try running 'vibekit auth login claude' to refresh."));
          }
          process.exit(1);
        }
      } catch (error) {
        spinner.fail("Verification failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
  
  // Add export command
  authCommand
    .command("export <provider>")
    .description("Export authentication token for use in other instances")
    .option("-f, --format <format>", "Output format: env, json, full, or refresh", "env")
    .action(async (provider: string, options: { format: string }) => {
      if (provider !== "claude") {
        console.error(chalk.red(`Unknown provider: ${provider}`));
        console.log(chalk.gray("Currently supported providers: claude"));
        process.exit(1);
      }
      
      try {
        const tokenData = await loadToken();
        if (!tokenData) {
          console.error(chalk.red("No authentication token found"));
          console.log(chalk.gray("Run 'vibekit auth login claude' to authenticate first."));
          process.exit(1);
        }
        
        const accessToken = await getValidToken();
        if (!accessToken) {
          console.error(chalk.red("Token is expired and could not be refreshed"));
          process.exit(1);
        }
        
        console.log(chalk.green("\n✅ OAuth Token Export\n"));
        
        // Show token info first
        if (tokenData.expires_in) {
          const expiresAt = new Date(tokenData.created_at + tokenData.expires_in * 1000);
          const now = new Date();
          const hoursLeft = Math.round((expiresAt.getTime() - now.getTime()) / 1000 / 60 / 60);
          console.log(chalk.gray(`Access token expires in: ${hoursLeft} hours (${expiresAt.toLocaleString()})`));
        }
        console.log();
        
        switch (options.format) {
          case "env":
            console.log(chalk.yellow("Environment variable format:"));
            console.log(chalk.white(`export CLAUDE_CODE_OAUTH_TOKEN="${accessToken}"`));
            console.log(chalk.gray("\n# Add this to your shell profile or CI/CD environment"));
            break;
            
          case "json":
            console.log(chalk.yellow("JSON format (access token only):"));
            console.log(JSON.stringify({ access_token: accessToken }, null, 2));
            break;
            
          case "full":
            console.log(chalk.yellow("Full token data (includes refresh token):"));
            console.log(chalk.red("⚠️  Warning: This contains sensitive data. Handle with care!"));
            console.log(JSON.stringify({
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              token_type: tokenData.token_type || "Bearer",
              expires_in: tokenData.expires_in,
              scope: tokenData.scope,
              created_at: tokenData.created_at
            }, null, 2));
            break;
            
          case "refresh":
            console.log(chalk.yellow("Refresh token only:"));
            console.log(chalk.red("⚠️  Warning: Store this securely! It has long-term access."));
            if (!tokenData.refresh_token) {
              console.log(chalk.red("No refresh token available"));
              process.exit(1);
            }
            console.log(chalk.white(tokenData.refresh_token));
            console.log(chalk.gray("\n💡 Tip: Save this for long-term storage. Refresh tokens last much longer than access tokens."));
            break;
            
          default:
            console.error(chalk.red(`Unknown format: ${options.format}`));
            console.log(chalk.gray("Supported formats: env, json, full, refresh"));
            process.exit(1);
        }
        
        console.log(chalk.cyan("\n💡 Usage tips:"));
        console.log(chalk.gray("- 'env' format: Best for CI/CD and scripts"));
        console.log(chalk.gray("- 'json' format: For programmatic access"));
        console.log(chalk.gray("- 'full' format: For complete token backup/restore"));
        console.log(chalk.gray("- 'refresh' format: For long-term storage (refresh token only)"));
      } catch (error) {
        console.error(chalk.red("Failed to export token:"), (error as Error).message);
        process.exit(1);
      }
    });
    
  // Add import command
  authCommand
    .command("import <provider>")
    .description("Import authentication token from another instance")
    .option("-t, --token <token>", "OAuth access token string")
    .option("-r, --refresh <token>", "OAuth refresh token string (will exchange for access token)")
    .option("-f, --file <file>", "JSON file containing token data")
    .option("-e, --env", "Import from CLAUDE_CODE_OAUTH_TOKEN environment variable")
    .action(async (provider: string, options: { token?: string; refresh?: string; file?: string; env?: boolean }) => {
      if (provider !== "claude") {
        console.error(chalk.red(`Unknown provider: ${provider}`));
        console.log(chalk.gray("Currently supported providers: claude"));
        process.exit(1);
      }
      
      const spinner = ora("Importing token...").start();
      
      try {
        let tokenData: any;
        
        if (options.env) {
          // Import from environment variable
          const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
          if (!envToken) {
            spinner.fail("No CLAUDE_CODE_OAUTH_TOKEN environment variable found");
            process.exit(1);
          }
          tokenData = {
            access_token: envToken,
            token_type: "Bearer",
            created_at: Date.now()
          };
          spinner.text = "Imported from environment variable";
          
        } else if (options.refresh) {
          // Import refresh token and exchange for access token
          spinner.text = "Exchanging refresh token for access token...";
          
          const { refreshTokenToAccessToken } = await import("../../auth/oauth.js");
          try {
            tokenData = await refreshTokenToAccessToken(options.refresh);
            spinner.text = "Successfully exchanged refresh token";
          } catch (error) {
            spinner.fail("Failed to exchange refresh token");
            console.error(chalk.red("Error: " + (error as Error).message));
            console.log(chalk.yellow("\nTip: The refresh token may be invalid or expired."));
            process.exit(1);
          }
          
        } else if (options.token) {
          // Import single access token
          tokenData = {
            access_token: options.token,
            token_type: "Bearer",
            created_at: Date.now()
          };
          spinner.text = "Imported access token";
          
        } else if (options.file) {
          // Import from JSON file
          const fs = (await import("fs")).promises;
          const fileContent = await fs.readFile(options.file, "utf-8");
          tokenData = JSON.parse(fileContent);
          
          // Validate required fields
          if (!tokenData.access_token) {
            spinner.fail("Invalid token file: missing access_token");
            process.exit(1);
          }
          
          // Update created_at if missing
          if (!tokenData.created_at) {
            tokenData.created_at = Date.now();
          }
          
          spinner.text = "Imported from file";
          
        } else {
          spinner.fail("No import source specified");
          console.log(chalk.gray("\nUsage examples:"));
          console.log(chalk.white("  vibekit auth import claude --env"));
          console.log(chalk.white("  vibekit auth import claude --token YOUR_ACCESS_TOKEN"));
          console.log(chalk.white("  vibekit auth import claude --refresh YOUR_REFRESH_TOKEN"));
          console.log(chalk.white("  vibekit auth import claude --file token.json"));
          process.exit(1);
        }
        
        // Save the imported token
        await saveToken(tokenData);
        spinner.succeed("Token imported successfully!");
        
        // Show import summary
        console.log(chalk.gray("\nImported token details:"));
        console.log(chalk.gray(`- Type: ${tokenData.token_type || "Bearer"}`));
        console.log(chalk.gray(`- Has refresh token: ${tokenData.refresh_token ? "Yes" : "No"}`));
        if (tokenData.scope) {
          console.log(chalk.gray(`- Scope: ${tokenData.scope}`));
        }
        if (tokenData.expires_in) {
          const expiresAt = new Date(tokenData.created_at + tokenData.expires_in * 1000);
          console.log(chalk.gray(`- Expires: ${expiresAt.toLocaleString()}`));
        }
        
        console.log(chalk.green("\n✅ You can now use vibekit with the imported token"));
        
      } catch (error) {
        spinner.fail("Import failed");
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    });
  
  return authCommand;
}