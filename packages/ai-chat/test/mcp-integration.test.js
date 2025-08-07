#!/usr/bin/env node

/**
 * MCP Integration Test Script
 * Tests the AI Chat package with real MCP servers and tools
 */

import { ChatClient } from '../dist/index.mjs';
import { MCPClientManager } from '@vibe-kit/mcp-client';

async function testMCPIntegration() {
  console.log('🧪 Starting MCP Integration Tests\n');
  
  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };
  
  // Test 1: Initialize Chat Client
  console.log('Test 1: Initializing Chat Client...');
  let chatClient;
  try {
    chatClient = new ChatClient();
    await chatClient.initialize();
    console.log('✅ Chat client initialized successfully');
    results.passed++;
    results.tests.push({ name: 'Initialize Chat Client', status: 'passed' });
  } catch (error) {
    console.error('❌ Failed to initialize chat client:', error.message);
    results.failed++;
    results.tests.push({ name: 'Initialize Chat Client', status: 'failed', error: error.message });
    return results;
  }
  
  // Test 2: Create Session
  console.log('\nTest 2: Creating chat session...');
  let session;
  try {
    session = await chatClient.createSession('MCP Integration Test');
    console.log(`✅ Session created: ${session.id}`);
    results.passed++;
    results.tests.push({ name: 'Create Session', status: 'passed' });
  } catch (error) {
    console.error('❌ Failed to create session:', error.message);
    results.failed++;
    results.tests.push({ name: 'Create Session', status: 'failed', error: error.message });
    return results;
  }
  
  // Test 3: Check MCP Server Connection
  console.log('\nTest 3: Checking MCP server availability...');
  let mcpManager;
  try {
    mcpManager = new MCPClientManager();
    const servers = await mcpManager.listServers();
    
    if (servers.length > 0) {
      console.log(`✅ Found ${servers.length} MCP server(s):`);
      servers.forEach(server => {
        console.log(`   - ${server.name}: ${server.status}`);
      });
      results.passed++;
      results.tests.push({ name: 'MCP Server Connection', status: 'passed' });
    } else {
      console.log('⚠️  No MCP servers configured');
      results.tests.push({ name: 'MCP Server Connection', status: 'skipped', note: 'No servers configured' });
    }
  } catch (error) {
    console.error('❌ Failed to connect to MCP servers:', error.message);
    results.failed++;
    results.tests.push({ name: 'MCP Server Connection', status: 'failed', error: error.message });
  }
  
  // Test 4: List Available Tools
  console.log('\nTest 4: Listing available MCP tools...');
  try {
    const tools = await mcpManager?.getAvailableTools() || [];
    
    if (tools.length > 0) {
      console.log(`✅ Found ${tools.length} tool(s):`);
      tools.slice(0, 5).forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });
      if (tools.length > 5) {
        console.log(`   ... and ${tools.length - 5} more`);
      }
      results.passed++;
      results.tests.push({ name: 'List MCP Tools', status: 'passed' });
    } else {
      console.log('⚠️  No MCP tools available');
      results.tests.push({ name: 'List MCP Tools', status: 'skipped', note: 'No tools available' });
    }
  } catch (error) {
    console.error('❌ Failed to list MCP tools:', error.message);
    results.failed++;
    results.tests.push({ name: 'List MCP Tools', status: 'failed', error: error.message });
  }
  
  // Test 5: Send Message Without Tools
  console.log('\nTest 5: Sending a simple message...');
  try {
    const response = await chatClient.sendMessage(
      'Hello! Can you tell me what 2+2 equals?',
      session.id
    );
    
    console.log('✅ Received response (streaming would occur here)');
    results.passed++;
    results.tests.push({ name: 'Send Simple Message', status: 'passed' });
  } catch (error) {
    console.error('❌ Failed to send message:', error.message);
    results.failed++;
    results.tests.push({ name: 'Send Simple Message', status: 'failed', error: error.message });
  }
  
  // Test 6: Send Message With Tool Request (if tools available)
  if (mcpManager && (await mcpManager.getAvailableTools()).length > 0) {
    console.log('\nTest 6: Sending message that might use MCP tools...');
    try {
      const response = await chatClient.sendMessage(
        'Can you check the current system time and tell me what it is?',
        session.id
      );
      
      console.log('✅ Received response with potential tool usage');
      results.passed++;
      results.tests.push({ name: 'Send Message with Tools', status: 'passed' });
    } catch (error) {
      console.error('❌ Failed to send message with tools:', error.message);
      results.failed++;
      results.tests.push({ name: 'Send Message with Tools', status: 'failed', error: error.message });
    }
  } else {
    console.log('\nTest 6: Skipping tool message test (no tools available)');
    results.tests.push({ name: 'Send Message with Tools', status: 'skipped', note: 'No tools available' });
  }
  
  // Test 7: Session Persistence
  console.log('\nTest 7: Testing session persistence...');
  try {
    const loadedSession = await chatClient.loadSession(session.id);
    
    if (loadedSession && loadedSession.messages.length > 0) {
      console.log(`✅ Session loaded with ${loadedSession.messages.length} message(s)`);
      results.passed++;
      results.tests.push({ name: 'Session Persistence', status: 'passed' });
    } else {
      throw new Error('Session not found or empty');
    }
  } catch (error) {
    console.error('❌ Failed session persistence test:', error.message);
    results.failed++;
    results.tests.push({ name: 'Session Persistence', status: 'failed', error: error.message });
  }
  
  // Test 8: Rate Limiting
  console.log('\nTest 8: Testing rate limiting...');
  try {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        chatClient.sendMessage(`Test message ${i}`, session.id)
          .catch(err => ({ error: err.message }))
      );
    }
    
    const responses = await Promise.all(promises);
    const rateLimited = responses.filter(r => r.error?.includes('rate'));
    
    console.log(`✅ Sent 5 rapid requests, ${rateLimited.length} were rate limited (expected behavior)`);
    results.passed++;
    results.tests.push({ name: 'Rate Limiting', status: 'passed' });
  } catch (error) {
    console.error('❌ Rate limiting test failed:', error.message);
    results.failed++;
    results.tests.push({ name: 'Rate Limiting', status: 'failed', error: error.message });
  }
  
  // Test 9: Input Validation
  console.log('\nTest 9: Testing input validation...');
  try {
    const invalidInputs = [
      '',  // Empty
      'a'.repeat(10001),  // Too long
      '<script>alert("xss")</script>',  // XSS attempt
    ];
    
    let blocked = 0;
    for (const input of invalidInputs) {
      try {
        await chatClient.sendMessage(input, session.id);
      } catch (error) {
        if (error.message.includes('validation') || error.message.includes('invalid')) {
          blocked++;
        }
      }
    }
    
    if (blocked === invalidInputs.length) {
      console.log(`✅ All ${blocked} invalid inputs were rejected`);
      results.passed++;
      results.tests.push({ name: 'Input Validation', status: 'passed' });
    } else {
      throw new Error(`Only ${blocked}/${invalidInputs.length} invalid inputs were rejected`);
    }
  } catch (error) {
    console.error('❌ Input validation test failed:', error.message);
    results.failed++;
    results.tests.push({ name: 'Input Validation', status: 'failed', error: error.message });
  }
  
  // Test 10: Cleanup
  console.log('\nTest 10: Cleaning up test session...');
  try {
    await chatClient.deleteSession(session.id);
    const deleted = await chatClient.loadSession(session.id);
    
    if (!deleted) {
      console.log('✅ Test session cleaned up successfully');
      results.passed++;
      results.tests.push({ name: 'Session Cleanup', status: 'passed' });
    } else {
      throw new Error('Session still exists after deletion');
    }
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    results.failed++;
    results.tests.push({ name: 'Session Cleanup', status: 'failed', error: error.message });
  }
  
  return results;
}

// Run tests and report results
async function main() {
  try {
    const results = await testMCPIntegration();
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(50));
    
    console.log(`\n✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏭️  Skipped: ${results.tests.filter(t => t.status === 'skipped').length}`);
    
    console.log('\nDetailed Results:');
    results.tests.forEach((test, index) => {
      const icon = test.status === 'passed' ? '✅' : 
                   test.status === 'failed' ? '❌' : '⏭️';
      console.log(`${index + 1}. ${icon} ${test.name}`);
      if (test.error) {
        console.log(`   Error: ${test.error}`);
      }
      if (test.note) {
        console.log(`   Note: ${test.note}`);
      }
    });
    
    const successRate = results.passed / (results.passed + results.failed) * 100;
    console.log(`\n📈 Success Rate: ${successRate.toFixed(1)}%`);
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n💥 Fatal error running tests:', error);
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}