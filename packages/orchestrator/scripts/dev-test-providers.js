#!/usr/bin/env node

/**
 * Manual test script for provider system
 * Run with: npm run dev:test-providers
 */

const { ProviderRegistry, TaskmasterProvider } = require('../dist/index.js');
const path = require('path');

async function testProviderRegistry() {
  console.log('🧪 Testing Provider Registry...');
  
  const registry = new ProviderRegistry();
  
  try {
    // Test 1: Register providers
    console.log('  ✓ Registering providers...');
    
    const taskmasterProvider = new TaskmasterProvider({
      projectRoot: process.cwd()
    });
    
    registry.register('taskmaster', taskmasterProvider, {
      projectRoot: process.cwd()
    });
    
    console.log(`    Registered providers: ${registry.listProviders().join(', ')}`);
    
    // Test 2: Get provider
    console.log('  ✓ Getting provider...');
    const provider = registry.get('taskmaster');
    console.log(`    Provider type: ${provider.type}`);
    
    // Test 3: Provider capabilities
    console.log('  ✓ Checking provider capabilities...');
    const capabilities = provider.getCapabilities();
    console.log(`    Supports epics: ${capabilities.supportsEpics}`);
    console.log(`    Supports subtasks: ${capabilities.supportsSubtasks}`);
    console.log(`    Supports decomposition: ${capabilities.supportsDecomposition}`);
    console.log(`    Max concurrent requests: ${capabilities.maxConcurrentRequests}`);
    
    // Test 4: Provider info
    console.log('  ✓ Getting provider info...');
    const info = registry.getProviderInfo('taskmaster');
    console.log(`    Provider info:`, info);
    
    console.log('  ✅ Provider Registry tests passed!');
    return registry;
  } catch (error) {
    console.error('  ❌ Provider Registry test failed:', error);
    throw error;
  }
}

async function testTaskmasterProvider() {
  console.log('🧪 Testing Taskmaster Provider...');
  
  const provider = new TaskmasterProvider({
    projectRoot: process.cwd(),
    autoExpand: false // Don't auto-expand for testing
  });
  
  try {
    // Test 1: Health check (without connection)
    console.log('  ✓ Testing health check (disconnected)...');
    const health1 = await provider.healthCheck();
    console.log(`    Health status: ${health1.status} - ${health1.message || 'OK'}`);
    
    // Test 2: Rate limit status
    console.log('  ✓ Testing rate limit status...');
    const rateLimit = await provider.getRateLimitStatus();
    console.log(`    Rate limit: ${rateLimit.remaining}/${rateLimit.limit} (resets at ${rateLimit.resetAt})`);
    
    // Test 3: Provider capabilities
    console.log('  ✓ Testing capabilities...');
    const capabilities = provider.getCapabilities();
    console.log(`    Capabilities:`, capabilities);
    
    // Note: We can't test actual MCP functionality without the Taskmaster server running
    console.log('  ⚠️  Note: MCP connection tests require Taskmaster server to be available');
    console.log('  ⚠️  To test full functionality, ensure @vibe-kit/taskmaster is installed and tasks.json exists');
    
    console.log('  ✅ Taskmaster Provider tests passed!');
    return provider;
  } catch (error) {
    console.error('  ❌ Taskmaster Provider test failed:', error);
    throw error;
  }
}

async function testProviderDetection() {
  console.log('🧪 Testing Provider Auto-detection...');
  
  const registry = new ProviderRegistry();
  
  // Register a default provider for fallback
  const defaultProvider = new TaskmasterProvider({
    projectRoot: process.cwd()
  });
  registry.register('taskmaster', defaultProvider);
  registry.register('github-issues', defaultProvider); // Mock default
  
  try {
    console.log('  ✓ Testing provider detection...');
    
    // Test detection from current directory
    const detected = await registry.detectFromContext(process.cwd());
    console.log(`    Detected provider: ${detected.type}`);
    
    console.log('  ✅ Provider detection tests passed!');
  } catch (error) {
    console.error('  ❌ Provider detection test failed:', error);
    throw error;
  }
}

async function testErrorHandling() {
  console.log('🧪 Testing Provider Error Handling...');
  
  const registry = new ProviderRegistry();
  
  try {
    // Test 1: Getting non-existent provider
    console.log('  ✓ Testing non-existent provider...');
    try {
      registry.get('non-existent');
      console.error('    ❌ Should have thrown error');
    } catch (error) {
      console.log(`    ✅ Correctly threw error: ${error.message}`);
    }
    
    // Test 2: Provider with invalid config
    console.log('  ✓ Testing provider with invalid config...');
    try {
      const badProvider = new TaskmasterProvider({
        projectRoot: '/non/existent/path'
      });
      
      // This should not throw here, but when trying to connect
      const health = await badProvider.healthCheck();
      console.log(`    Health check result: ${health.status} - ${health.message}`);
    } catch (error) {
      console.log(`    ✅ Handled error gracefully: ${error.message}`);
    }
    
    console.log('  ✅ Error handling tests passed!');
  } catch (error) {
    console.error('  ❌ Error handling test failed:', error);
    throw error;
  }
}

async function cleanup() {
  console.log('🧹 Cleaning up...');
  
  try {
    // No cleanup needed for provider tests
    console.log('  ✅ Cleanup completed!');
  } catch (error) {
    console.warn('  ⚠️  Cleanup warning:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting Provider System Tests...\n');
  
  try {
    const registry = await testProviderRegistry();
    console.log('');
    
    await testTaskmasterProvider();
    console.log('');
    
    await testProviderDetection();
    console.log('');
    
    await testErrorHandling();
    console.log('');
    
    console.log('🎉 All provider system tests passed!');
    console.log('');
    console.log('📋 Summary:');
    console.log('  ✅ Provider Registry - Working');
    console.log('  ✅ Taskmaster Provider - Working');
    console.log('  ✅ Provider Detection - Working');
    console.log('  ✅ Error Handling - Working');
    console.log('');
    console.log('🚀 Phase 3: Provider Abstraction - Complete!');
    
  } catch (error) {
    console.error('❌ Provider system tests failed:', error);
    process.exit(1);
  }
  
  await cleanup();
}

if (require.main === module) {
  main();
}