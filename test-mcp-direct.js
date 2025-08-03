#!/usr/bin/env node

/**
 * Test MCP directly with Claude CLI
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

async function testMCPDirect() {
  console.log('🧪 Testing MCP with Claude CLI directly\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment');
    process.exit(1);
  }

  // MCP configuration in Claude CLI format
  const mcpConfig = {
    mcpServers: {
      "time-mcp": {
        command: "npx",
        args: ["-y", "time-mcp"]
      }
    }
  };

  // Test prompt
  const prompt = `Please use the current_time MCP tool to get the current time for America/New_York timezone and print it.`;

  // Build Claude command with properly escaped JSON
  const mcpConfigJson = JSON.stringify(mcpConfig).replace(/"/g, '\\"');
  const claudeCommand = `echo "${prompt}" | claude -p --output-format stream-json --verbose --model claude-3-5-sonnet-20241022 --mcp-config "${mcpConfigJson}"`;

  console.log('📋 Running Claude with MCP config...\n');
  console.log('MCP Config:', JSON.stringify(mcpConfig, null, 2));
  console.log('\n---\n');

  try {
    const { stdout, stderr } = await execAsync(claudeCommand, {
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
      },
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    if (stdout) {
      console.log('📤 Output:');
      // Parse streaming JSON output
      const lines = stdout.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.content) {
            process.stdout.write(data.content);
          }
        } catch {
          // Not JSON, print as is
          console.log(line);
        }
      }
    }

    if (stderr) {
      console.log('\n⚠️ Stderr:');
      console.log(stderr);
    }

    console.log('\n✅ Test completed');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stdout) {
      console.log('stdout:', error.stdout);
    }
    if (error.stderr) {
      console.log('stderr:', error.stderr);
    }
  }
}

// Run the test
testMCPDirect();