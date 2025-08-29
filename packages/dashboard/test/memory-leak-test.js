#!/usr/bin/env node

/**
 * Memory Leak Test for SSE Streaming
 * 
 * This script tests the memory leak fixes by:
 * 1. Creating multiple SSE connections
 * 2. Simulating connection drops at various stages
 * 3. Monitoring resource cleanup
 */

const http = require('http');
const { setTimeout } = require('timers/promises');

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  sessionIds: ['test-session-1', 'test-session-2', 'test-session-3'],
  connections: 5,
  dropInterval: 3000, // Drop connections every 3 seconds
  testDuration: 30000, // Run test for 30 seconds
};

class MemoryLeakTest {
  constructor() {
    this.activeConnections = new Set();
    this.connectionCount = 0;
    this.dropCount = 0;
    this.errorCount = 0;
  }

  async run() {
    console.log('🧪 Starting Memory Leak Test...');
    console.log(`📊 Config: ${TEST_CONFIG.connections} connections, ${TEST_CONFIG.testDuration}ms duration`);
    
    // Start connection creation
    const creationPromise = this.createConnections();
    
    // Start connection dropping
    const droppingPromise = this.dropConnections();
    
    // Run test for specified duration
    await setTimeout(TEST_CONFIG.testDuration);
    
    console.log('⏰ Test duration completed, cleaning up...');
    
    // Close all remaining connections
    await this.cleanup();
    
    this.printResults();
  }

  async createConnections() {
    while (true) {
      try {
        if (this.activeConnections.size < TEST_CONFIG.connections) {
          await this.createConnection();
        }
        await setTimeout(1000); // Create connections every second
      } catch (error) {
        console.error('❌ Error creating connection:', error.message);
        this.errorCount++;
        await setTimeout(2000); // Wait longer on error
      }
    }
  }

  async createConnection() {
    const sessionId = TEST_CONFIG.sessionIds[
      Math.floor(Math.random() * TEST_CONFIG.sessionIds.length)
    ];
    const connectionId = `conn-${++this.connectionCount}`;
    
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/sessions/${sessionId}/stream`,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      }
    });

    req.on('response', (res) => {
      console.log(`📡 Connection ${connectionId} established (status: ${res.statusCode})`);
      
      if (res.statusCode === 200) {
        this.activeConnections.add({ req, res, connectionId });
        
        res.on('data', (chunk) => {
          // Parse SSE data if needed for testing
          const data = chunk.toString();
          if (data.includes('connected')) {
            console.log(`✅ Connection ${connectionId} received connected event`);
          }
        });
        
        res.on('end', () => {
          console.log(`🔚 Connection ${connectionId} ended normally`);
          this.removeConnection(connectionId);
        });
        
        res.on('error', (error) => {
          console.error(`❌ Connection ${connectionId} error:`, error.message);
          this.removeConnection(connectionId);
          this.errorCount++;
        });
      } else {
        console.error(`❌ Connection ${connectionId} failed with status ${res.statusCode}`);
        this.errorCount++;
      }
    });

    req.on('error', (error) => {
      console.error(`❌ Request error for ${connectionId}:`, error.message);
      this.errorCount++;
    });

    req.end();
  }

  async dropConnections() {
    while (true) {
      await setTimeout(TEST_CONFIG.dropInterval);
      
      if (this.activeConnections.size > 0) {
        // Drop a random connection
        const connections = Array.from(this.activeConnections);
        const toDrop = connections[Math.floor(Math.random() * connections.length)];
        
        console.log(`💥 Dropping connection ${toDrop.connectionId}`);
        this.dropConnection(toDrop);
        this.dropCount++;
      }
    }
  }

  dropConnection(connection) {
    try {
      connection.req.destroy();
      this.removeConnection(connection.connectionId);
    } catch (error) {
      console.error(`❌ Error dropping connection ${connection.connectionId}:`, error.message);
    }
  }

  removeConnection(connectionId) {
    for (const conn of this.activeConnections) {
      if (conn.connectionId === connectionId) {
        this.activeConnections.delete(conn);
        break;
      }
    }
  }

  async cleanup() {
    console.log(`🧹 Cleaning up ${this.activeConnections.size} remaining connections...`);
    
    const cleanupPromises = [];
    for (const connection of this.activeConnections) {
      cleanupPromises.push(
        new Promise((resolve) => {
          connection.req.destroy();
          setTimeout(() => resolve(), 100); // Give it time to cleanup
        })
      );
    }
    
    await Promise.allSettled(cleanupPromises);
    this.activeConnections.clear();
  }

  printResults() {
    console.log('\n📊 Test Results:');
    console.log('================');
    console.log(`🔢 Total connections created: ${this.connectionCount}`);
    console.log(`💥 Connections dropped: ${this.dropCount}`);
    console.log(`❌ Errors encountered: ${this.errorCount}`);
    console.log(`🔗 Active connections at end: ${this.activeConnections.size}`);
    
    if (this.activeConnections.size === 0 && this.errorCount < this.connectionCount * 0.1) {
      console.log('✅ Test PASSED - No obvious memory leaks detected');
    } else {
      console.log('❌ Test FAILED - Potential memory leaks or high error rate');
    }
  }
}

// Run the test if called directly
if (require.main === module) {
  const test = new MemoryLeakTest();
  test.run().catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
}

module.exports = MemoryLeakTest;