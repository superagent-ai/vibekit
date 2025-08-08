#!/usr/bin/env node

// Test script to verify npx MCP server connection
const { MCPClientManager } = require('./dist/index.js');

async function testNpxConnection() {
  console.log('Testing npx MCP server connection...\n');
  
  const manager = new MCPClientManager({
    configPath: './test-mcp-config.json'
  });
  
  await manager.initialize();
  
  // Add a test server using npx
  const server = await manager.addServer({
    name: 'Task Master AI Test',
    description: 'Testing npx connection with task-master-ai',
    transport: 'stdio',
    config: {
      command: 'npx',
      args: ['-y', '--package=task-master-ai', 'task-master-ai'],
      env: {
        // Add API keys if available
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key',
      }
    }
  });
  
  console.log('Server added:', server.id);
  console.log('Attempting to connect...\n');
  
  try {
    await manager.connect(server.id);
    console.log('✅ Successfully connected to server!\n');
    
    // Try to get tools
    const tools = await manager.getTools(server.id);
    console.log(`Found ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description || 'No description'}`);
    });
    
    // Disconnect
    await manager.disconnect(server.id);
    console.log('\n✅ Disconnected successfully');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Full error:', error);
  }
  
  // Clean up
  await manager.removeServer(server.id);
  process.exit(0);
}

testNpxConnection().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});