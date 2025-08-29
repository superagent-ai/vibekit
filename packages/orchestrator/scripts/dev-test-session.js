#!/usr/bin/env node

/**
 * Manual test script for session management
 * Run with: npm run dev:test-session
 */

const { SessionManager } = require('../dist/index.js');
const fs = require('fs/promises');
const path = require('path');

async function testSessionCreation() {
  console.log('🧪 Testing Session Creation...');
  
  const sessionManager = new SessionManager();
  
  try {
    // Test 1: Create basic session
    console.log('  ✓ Creating basic session...');
    const session1 = await sessionManager.createSession({
      epicId: 'epic-001',
      epicName: 'Basic Test Epic',
      provider: {
        type: 'taskmaster',
        config: { projectRoot: '/test' }
      },
      parallel: true
    });
    
    console.log(`    Created session: ${session1.id}`);
    console.log(`    Epic: ${session1.epicName} (${session1.epicId})`);
    console.log(`    Status: ${session1.status}`);
    console.log(`    Provider: ${session1.provider.type}`);

    // Test 2: Create session without epic name (should auto-generate)
    console.log('  ✓ Creating session with auto-generated epic name...');
    const session2 = await sessionManager.createSession({
      epicId: 'epic-002',
      provider: {
        type: 'linear',
        config: { apiKey: 'test-key' }
      }
    });
    
    console.log(`    Created session: ${session2.id}`);
    console.log(`    Auto-generated epic name: ${session2.epicName}`);

    // Test 3: Verify sessions persist
    console.log('  ✓ Loading sessions to verify persistence...');
    const loaded1 = await sessionManager.loadSession(session1.id);
    const loaded2 = await sessionManager.loadSession(session2.id);
    
    console.log(`    Session 1 loaded: ${loaded1 ? '✅' : '❌'}`);
    console.log(`    Session 2 loaded: ${loaded2 ? '✅' : '❌'}`);

    console.log('  ✅ Session creation tests passed!');
    return { session1, session2 };
  } catch (error) {
    console.error('  ❌ Session creation test failed:', error);
    throw error;
  }
}

async function testSessionLifecycle(sessions) {
  console.log('🧪 Testing Session Lifecycle...');
  
  const sessionManager = new SessionManager();
  const { session1, session2 } = sessions;
  
  try {
    // Test 1: Pause and resume session
    console.log('  ✓ Testing pause/resume cycle...');
    
    console.log(`    Session 1 initial status: ${session1.status}`);
    
    await sessionManager.pauseSession(session1.id);
    let pausedSession = await sessionManager.loadSession(session1.id);
    console.log(`    After pause: ${pausedSession.status} (paused at: ${pausedSession.pausedAt})`);
    
    const resumedSession = await sessionManager.resumeSession(session1.id);
    console.log(`    After resume: ${resumedSession.status} (resumed at: ${resumedSession.lastActiveAt})`);

    // Test 2: Complete session
    console.log('  ✓ Testing session completion...');
    await sessionManager.completeSession(session2.id);
    const completedSession = await sessionManager.loadSession(session2.id);
    console.log(`    Session 2 status: ${completedSession.status} (completed at: ${completedSession.completedAt})`);

    // Test 3: Fail session
    console.log('  ✓ Testing session failure...');
    await sessionManager.failSession(session1.id, 'Test failure for demonstration');
    const failedSession = await sessionManager.loadSession(session1.id);
    console.log(`    Session 1 status: ${failedSession.status}`);

    console.log('  ✅ Session lifecycle tests passed!');
  } catch (error) {
    console.error('  ❌ Session lifecycle test failed:', error);
    throw error;
  }
}

async function testCheckpoints() {
  console.log('🧪 Testing Checkpoint System...');
  
  const sessionManager = new SessionManager();
  
  try {
    // Create a session for checkpoint testing
    const session = await sessionManager.createSession({
      epicId: 'epic-checkpoint',
      epicName: 'Checkpoint Test Epic',
      provider: {
        type: 'github-issues',
        config: { repo: 'test/repo' }
      }
    });

    console.log('  ✓ Creating checkpoints...');
    
    // Simulate adding tasks to the session
    session.checkpoint.pendingTasks = ['task-1', 'task-2', 'task-3'];
    session.checkpoint.completedTasks = [];
    
    // Create first checkpoint
    const checkpoint1 = await sessionManager.createCheckpoint(session);
    console.log(`    Created checkpoint 1: ${checkpoint1.id}`);
    console.log(`    Tasks at checkpoint 1: ${checkpoint1.pendingTasks.length} pending, ${checkpoint1.completedTasks.length} completed`);

    // Simulate task progress
    session.checkpoint.pendingTasks = ['task-2', 'task-3'];
    session.checkpoint.completedTasks = ['task-1'];
    
    // Create second checkpoint
    const checkpoint2 = await sessionManager.createCheckpoint(session);
    console.log(`    Created checkpoint 2: ${checkpoint2.id}`);
    console.log(`    Tasks at checkpoint 2: ${checkpoint2.pendingTasks.length} pending, ${checkpoint2.completedTasks.length} completed`);

    // Test checkpoint listing
    console.log('  ✓ Listing checkpoints...');
    const checkpoints = await sessionManager.listCheckpoints(session.id);
    console.log(`    Found ${checkpoints.length} checkpoints`);
    checkpoints.forEach((cp, index) => {
      console.log(`      ${index + 1}. ${cp.id} (${cp.timestamp})`);
    });

    // Test checkpoint restoration
    console.log('  ✓ Testing checkpoint restoration...');
    
    // Further modify session
    session.checkpoint.pendingTasks = [];
    session.checkpoint.completedTasks = ['task-1', 'task-2', 'task-3'];
    await sessionManager.saveSession(session);
    
    console.log(`    Before restore: ${session.checkpoint.completedTasks.length} completed tasks`);
    
    // Restore to first checkpoint
    const restoredSession = await sessionManager.restoreFromCheckpoint(session.id, checkpoint1.id);
    console.log(`    After restore to checkpoint 1: ${restoredSession.checkpoint.completedTasks.length} completed tasks`);
    console.log(`    Pending tasks restored: ${restoredSession.checkpoint.pendingTasks.join(', ')}`);

    console.log('  ✅ Checkpoint system tests passed!');
  } catch (error) {
    console.error('  ❌ Checkpoint system test failed:', error);
    throw error;
  }
}

async function testSessionListing() {
  console.log('🧪 Testing Session Listing & Filtering...');
  
  const sessionManager = new SessionManager();
  
  try {
    // Create additional sessions for testing
    const testSessions = [];
    
    for (let i = 0; i < 3; i++) {
      const session = await sessionManager.createSession({
        epicId: `epic-list-${i}`,
        epicName: `List Test Epic ${i}`,
        provider: {
          type: i % 2 === 0 ? 'taskmaster' : 'linear',
          config: {}
        }
      });
      testSessions.push(session);
      
      // Pause every other session
      if (i % 2 === 1) {
        await sessionManager.pauseSession(session.id);
      }
    }

    // Test 1: List all sessions
    console.log('  ✓ Listing all sessions...');
    const allSessions = await sessionManager.listSessions();
    console.log(`    Found ${allSessions.length} total sessions`);
    
    allSessions.forEach((session, index) => {
      console.log(`      ${index + 1}. ${session.id} - ${session.epicName}`);
      console.log(`         Status: ${session.status} | Provider: ${session.provider}`);
      console.log(`         Progress: ${session.progress.completed}/${session.progress.total} tasks`);
    });

    // Test 2: Filter by status
    console.log('  ✓ Filtering by status...');
    const activeSessions = await sessionManager.listSessions({ status: 'active' });
    const pausedSessions = await sessionManager.listSessions({ status: 'paused' });
    const completedSessions = await sessionManager.listSessions({ status: 'completed' });
    
    console.log(`    Active sessions: ${activeSessions.length}`);
    console.log(`    Paused sessions: ${pausedSessions.length}`);
    console.log(`    Completed sessions: ${completedSessions.length}`);

    // Test 3: Filter by provider
    console.log('  ✓ Filtering by provider...');
    const taskmasterSessions = await sessionManager.listSessions({ provider: 'taskmaster' });
    const linearSessions = await sessionManager.listSessions({ provider: 'linear' });
    
    console.log(`    Taskmaster sessions: ${taskmasterSessions.length}`);
    console.log(`    Linear sessions: ${linearSessions.length}`);

    console.log('  ✅ Session listing tests passed!');
  } catch (error) {
    console.error('  ❌ Session listing test failed:', error);
    throw error;
  }
}

async function verifyFileStructure() {
  console.log('🧪 Verifying Session File Structure...');
  
  try {
    const basePath = '.vibekit/orchestrator';
    
    // Check sessions directory
    const sessionsPath = path.join(basePath, 'sessions');
    const sessionFiles = await fs.readdir(sessionsPath, { recursive: true });
    console.log(`  ✓ Sessions directory contains: ${sessionFiles.length} files`);
    
    // Show some example files
    const exampleFiles = sessionFiles.slice(0, 5);
    exampleFiles.forEach(file => {
      console.log(`      - ${file}`);
    });

    // Check session index
    const indexPath = path.join(sessionsPath, 'index.json');
    const indexContent = await fs.readFile(indexPath, 'utf8');
    const index = JSON.parse(indexContent);
    console.log(`  ✓ Session index contains ${index.sessions.length} sessions`);
    console.log(`  ✓ Index last updated: ${index.lastUpdated}`);

    // Check checkpoints directory
    const checkpointsPath = path.join(basePath, 'checkpoints');
    try {
      const checkpointDirs = await fs.readdir(checkpointsPath);
      console.log(`  ✓ Checkpoints directory contains ${checkpointDirs.length} session directories`);
    } catch (error) {
      console.log(`  ✓ Checkpoints directory: (empty or not created yet)`);
    }

    // Check events directory
    const eventsPath = path.join(basePath, 'events');
    const eventFiles = await fs.readdir(eventsPath);
    console.log(`  ✓ Events directory contains: ${eventFiles.join(', ')}`);

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
  console.log('🚀 Starting Session Management Tests...\n');
  
  try {
    const sessions = await testSessionCreation();
    console.log('');
    
    await testSessionLifecycle(sessions);
    console.log('');
    
    await testCheckpoints();
    console.log('');
    
    await testSessionListing();
    console.log('');
    
    await verifyFileStructure();
    console.log('');
    
    console.log('🎉 All session management tests passed!');
  } catch (error) {
    console.error('❌ Session management tests failed:', error);
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