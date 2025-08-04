#!/usr/bin/env node

/**
 * Create PR with all 6 MCP tools demonstration
 */

import { VibeKit } from '@vibe-kit/sdk';
import { createLocalProvider } from '@vibe-kit/dagger';
import dotenv from 'dotenv';

dotenv.config();

async function createMCP6ToolsPR() {
  console.log('🚀 Creating PR with All 6 MCP Tools Demo\n');

  let vibeKit;

  try {
    const localProvider = createLocalProvider({
      githubToken: process.env.GITHUB_TOKEN,
      preferRegistryImages: true
    });

    const demoId = Date.now();

    vibeKit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: "claude-3-5-sonnet-20241022",
      })
      .withSandbox(localProvider)
      .withMCP({
        servers: [
          {
            name: "time-mcp",
            type: "local",
            command: "npx",
            args: ["-y", "time-mcp"],
            description: "Time and date MCP server with 6 tools"
          }
        ]
      })
      .withGithub({
        token: process.env.GITHUB_TOKEN,
        repository: "joedanz/test-repo",
      })
      .withWorkingDirectory("/vibe0");

    console.log('✅ VibeKit configured\n');

    console.log('🎯 Creating 6 MCP tools demonstration...');
    const result = await vibeKit.generateCode({
      prompt: `Create a file called SIX_MCP_TOOLS_COMPLETE_${demoId}.md that demonstrates all 6 time-mcp tools with their individual outputs.

# Six MCP Tools Complete Demonstration

## Tool Outputs

### 1. Current Time Tool
Call mcp__time-mcp__current_time
Result: [actual output]

### 2. Timestamp Tool  
Call mcp__time-mcp__get_timestamp for current time
Result: [actual output]

### 3. Week Year Tool
Call mcp__time-mcp__get_week_year for today
Result: [actual output]

### 4. Days in Month Tool
Call mcp__time-mcp__days_in_month for August 2025
Result: [actual output]

### 5. Convert Time Tool
Call mcp__time-mcp__convert_time to convert current UTC to:
- New York: [actual output]
- London: [actual output] 
- Tokyo: [actual output]

### 6. Relative Time Tool
Call mcp__time-mcp__relative_time for:
- Since 2025-01-01: [actual output]
- Since 2025-08-01: [actual output]

## Summary
All 6 MCP tools working with real data!

Please call each tool and show the actual results!`,
      mode: "code"
    });
    
    console.log('Exit code:', result.exitCode);

    if (result.exitCode === 0) {
      console.log('\n📄 File created successfully');
      
      // Show file content
      const fileContent = await vibeKit.executeCommand(`cat /vibe0/SIX_MCP_TOOLS_COMPLETE_${demoId}.md`);
      console.log('\n📖 Generated file content:');
      console.log(fileContent.stdout);

      // Create PR immediately
      console.log('\n🔀 Creating Pull Request...');
      try {
        const branchPrefix = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const prResult = await vibeKit.createPullRequest(undefined, branchPrefix);
        
        console.log('\n✅ SUCCESS: Pull Request Created!');
        console.log('🔗 PR URL:', prResult.html_url);
        console.log('📝 PR Number:', prResult.number);
        console.log('🏷️ PR Title:', prResult.title);
        console.log('\n🎉 All 6 MCP tools demonstrated in PR!');
        
      } catch (prError) {
        console.error('\n❌ PR creation failed:', prError.message);
        console.error('Error details:', prError);
      }
    } else {
      console.error('File creation failed');
    }

    await vibeKit.kill();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (vibeKit) {
      await vibeKit.kill();
    }
    process.exit(1);
  }
}

createMCP6ToolsPR();