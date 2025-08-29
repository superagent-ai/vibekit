#!/usr/bin/env node

/**
 * Manual test script for storage components
 * Run with: npm run test:storage-manual
 */

const { JSONLEventStore, JSONStateStore, OrchestrationEventType } = require('../dist/index.js');
const fs = require('fs/promises');
const path = require('path');

async function testJSONLEventStore() {
  console.log('🧪 Testing JSONLEventStore...');
  
  const eventStore = new JSONLEventStore();
  
  try {
    // Test 1: Append events
    console.log('  ✓ Appending events...');
    await eventStore.appendEvent('test-session', {
      id: 'evt_001',
      type: OrchestrationEventType.SESSION_CREATED,
      timestamp: new Date().toISOString(),
      sessionId: 'sess_123',
      data: { epic: 'test-epic' }
    });

    await eventStore.appendEvent('test-session', {
      id: 'evt_002',
      type: OrchestrationEventType.TASK_STARTED,
      timestamp: new Date().toISOString(),
      sessionId: 'sess_123',
      data: { taskId: 'task_001' }
    });

    // Test 2: Read events
    console.log('  ✓ Reading events...');
    const events = await eventStore.readEvents('test-session');
    console.log(`    Found ${events.length} events`);

    // Test 3: Read with filters
    console.log('  ✓ Reading events with filters...');
    const sessionEvents = await eventStore.readEvents('test-session', {
      filter: (event) => event.type === OrchestrationEventType.SESSION_CREATED
    });
    console.log(`    Found ${sessionEvents.length} session events`);

    // Test 4: File exists
    const eventFilePath = '.vibekit/orchestrator/events/test-session.jsonl';
    const stats = await fs.stat(eventFilePath);
    console.log(`    Event file size: ${stats.size} bytes`);

    // Test 5: Stream stats
    const streamStats = await eventStore.getStreamStats('test-session');
    console.log(`    Stream stats: ${streamStats.eventCount} events, ${streamStats.size} bytes`);

    console.log('  ✅ JSONLEventStore tests passed!');
  } catch (error) {
    console.error('  ❌ JSONLEventStore test failed:', error);
    throw error;
  } finally {
    await eventStore.close();
  }
}

async function testJSONStateStore() {
  console.log('🧪 Testing JSONStateStore...');
  
  const stateStore = new JSONStateStore();
  
  try {
    // Test 1: Save state
    console.log('  ✓ Saving state...');
    const testState = {
      id: 'session_123',
      name: 'Test Session',
      createdAt: new Date(),
      metadata: new Map([
        ['key1', 'value1'],
        ['key2', { nested: 'data' }]
      ]),
      progress: {
        completed: 5,
        pending: 10,
        total: 15
      }
    };

    await stateStore.saveState('sessions/test-session', testState);

    // Test 2: Load state
    console.log('  ✓ Loading state...');
    const loaded = await stateStore.loadState('sessions/test-session');
    console.log(`    Loaded session: ${loaded.name}`);
    console.log(`    Created at: ${loaded.createdAt}`);
    console.log(`    Metadata type: ${loaded.metadata.constructor.name}`);

    // Test 3: Update state
    console.log('  ✓ Updating state...');
    await stateStore.updateState('sessions/test-session', {
      progress: {
        completed: 7,
        pending: 8,
        total: 15
      }
    });

    const updated = await stateStore.loadState('sessions/test-session');
    console.log(`    Updated progress: ${updated.progress.completed}/${updated.progress.total}`);

    // Test 4: List states
    console.log('  ✓ Listing states...');
    await stateStore.saveState('sessions/another-session', { id: 'another' });
    const sessionKeys = await stateStore.listStates('sessions/');
    console.log(`    Found ${sessionKeys.length} session keys:`, sessionKeys);

    // Test 5: Backup and restore
    console.log('  ✓ Testing backup/restore...');
    const backupKey = await stateStore.backupState('sessions/test-session');
    console.log(`    Created backup: ${backupKey}`);

    await stateStore.restoreFromBackup(backupKey, 'sessions/restored-session');
    const restored = await stateStore.loadState('sessions/restored-session');
    console.log(`    Restored session: ${restored.name}`);

    // Test 6: Validate state
    console.log('  ✓ Validating state...');
    const validation = await stateStore.validateState('sessions/test-session');
    console.log(`    State valid: ${validation.valid}`);

    // Test 7: Cache stats
    const cacheStats = stateStore.getCacheStats();
    console.log(`    Cache size: ${cacheStats.size} items`);

    console.log('  ✅ JSONStateStore tests passed!');
  } catch (error) {
    console.error('  ❌ JSONStateStore test failed:', error);
    throw error;
  }
}

async function verifyFileStructure() {
  console.log('🧪 Verifying file structure...');
  
  try {
    const basePath = '.vibekit/orchestrator';
    
    // Check events directory
    const eventsPath = path.join(basePath, 'events');
    const eventFiles = await fs.readdir(eventsPath);
    console.log(`  ✓ Events directory contains: ${eventFiles.join(', ')}`);
    
    // Check sessions directory
    const sessionsPath = path.join(basePath, 'sessions');
    const sessionFiles = await fs.readdir(sessionsPath, { recursive: true });
    console.log(`  ✓ Sessions directory contains: ${sessionFiles.join(', ')}`);
    
    // Check file contents
    const sessionFile = path.join(sessionsPath, 'test-session.json');
    const sessionContent = await fs.readFile(sessionFile, 'utf8');
    const sessionData = JSON.parse(sessionContent);
    console.log(`  ✓ Session file structure looks good: ${Object.keys(sessionData).join(', ')}`);
    
    console.log('  ✅ File structure verification passed!');
  } catch (error) {
    console.error('  ❌ File structure verification failed:', error);
    throw error;
  }
}

async function cleanup() {
  console.log('🧹 Cleaning up test data...');
  
  try {
    await fs.rm('.vibekit', { recursive: true, force: true });
    console.log('  ✅ Cleanup completed!');
  } catch (error) {
    console.warn('  ⚠️  Cleanup warning:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting manual storage tests...\n');
  
  try {
    await testJSONLEventStore();
    console.log('');
    
    await testJSONStateStore();
    console.log('');
    
    await verifyFileStructure();
    console.log('');
    
    console.log('🎉 All manual storage tests passed!');
  } catch (error) {
    console.error('❌ Manual storage tests failed:', error);
    process.exit(1);
  }
  
  // Ask if user wants to keep test data
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('\nKeep test data for inspection? (y/N): ', async (answer) => {
    if (answer.toLowerCase() !== 'y') {
      await cleanup();
    } else {
      console.log('Test data preserved in .vibekit/ directory');
    }
    rl.close();
  });
}

if (require.main === module) {
  main();
}