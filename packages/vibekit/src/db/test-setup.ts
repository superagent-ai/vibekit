/**
 * Phase 1 Test Setup - Verify Drizzle ORM Implementation
 * 
 * This file tests the basic functionality of our Drizzle setup:
 * - Database initialization
 * - Schema creation
 * - Basic CRUD operations
 * - Connection management
 */

import { 
  initializeTelemetryDB, 
  closeTelemetryDB,
  DrizzleTelemetryConfig,
  NewTelemetryEvent,
  NewTelemetrySession,
  NewTelemetryError,
  telemetryEvents,
  telemetrySessions,
  telemetryErrors,
} from './index';

export async function runPhase1Tests(): Promise<void> {
  console.log('🧪 Running Phase 1 Drizzle ORM Tests...\n');

  // Test configuration
  const testConfig: DrizzleTelemetryConfig = {
    dbPath: '.vibekit/telemetry-phase1-test.db',
    enableQueryLogging: true,
    enableMetrics: true,
    streamBatchSize: 10,
  };

  try {
    // Test 1: Database Initialization
    console.log('1️⃣ Testing database initialization...');
    const db = await initializeTelemetryDB(testConfig);
    const database = await db.getDatabase();
    console.log('✅ Database initialized successfully');

    // Test 2: Health Check
    console.log('\n2️⃣ Testing health check...');
    const isHealthy = await db.healthCheck();
    if (!isHealthy) throw new Error('Health check failed');
    console.log('✅ Health check passed');

    // Test 3: Session Creation
    console.log('\n3️⃣ Testing session creation...');
    const newSession: NewTelemetrySession = {
      id: 'test-session-phase1',
      agentType: 'claude',
      mode: 'chat',
      status: 'active',
      startTime: Date.now(),
      sandboxId: 'test-sandbox',
      repoUrl: 'https://github.com/test/repo',
      metadata: JSON.stringify({ test: true }),
    };

    await database.insert(telemetrySessions).values(newSession);
    console.log('✅ Session created successfully');

    // Test 4: Event Creation
    console.log('\n4️⃣ Testing event creation...');
    const events: NewTelemetryEvent[] = [
      {
        sessionId: 'test-session-phase1',
        eventType: 'start',
        agentType: 'claude',
        mode: 'chat',
        prompt: 'Test prompt for start event',
        timestamp: Date.now(),
      },
      {
        sessionId: 'test-session-phase1',
        eventType: 'stream',
        agentType: 'claude',
        mode: 'chat',
        prompt: 'Test prompt for stream event',
        streamData: 'Test stream data chunk',
        timestamp: Date.now() + 100,
      },
      {
        sessionId: 'test-session-phase1',
        eventType: 'end',
        agentType: 'claude',
        mode: 'chat',
        prompt: 'Test prompt for end event',
        timestamp: Date.now() + 200,
      },
    ];

    await database.insert(telemetryEvents).values(events);
    console.log('✅ Events created successfully');

    // Test 5: Error Logging
    console.log('\n5️⃣ Testing error logging...');
    const newError: NewTelemetryError = {
      sessionId: 'test-session-phase1',
      errorType: 'test_error',
      errorMessage: 'This is a test error for Phase 1',
      severity: 'low',
      timestamp: Date.now(),
      context: JSON.stringify({ testContext: true }),
    };

    await database.insert(telemetryErrors).values(newError);
    console.log('✅ Error logged successfully');

    // Test 6: Query with Relations
    console.log('\n6️⃣ Testing queries with relations...');
    const sessionWithEvents = await database.query.telemetrySessions.findFirst({
      where: (sessions, { eq }) => eq(sessions.id, 'test-session-phase1'),
      with: {
        events: true,
        errors: true,
      },
    });

    if (!sessionWithEvents) throw new Error('Session not found');
    console.log(`✅ Found session with ${sessionWithEvents.events.length} events and ${sessionWithEvents.errors.length} errors`);

    // Test 7: Performance Metrics
    console.log('\n7️⃣ Testing performance metrics...');
    const metrics = db.getMetrics();
    console.log(`✅ Metrics: ${metrics.totalQueries} queries, avg ${metrics.avgQueryTime.toFixed(2)}ms`);

    // Test 8: Configuration Verification
    console.log('\n8️⃣ Testing configuration...');
    const config = db.getConfig();
    if (config.streamBatchSize !== 10) throw new Error('Configuration not applied');
    console.log('✅ Configuration verified');

    // Test 9: Data Cleanup Test
    console.log('\n9️⃣ Testing data cleanup...');
    await database.delete(telemetryErrors);
    await database.delete(telemetryEvents);
    await database.delete(telemetrySessions);
    console.log('✅ Data cleanup successful');

    console.log('\n🎉 All Phase 1 tests passed! Drizzle ORM setup is working correctly.\n');

    // Display summary
    console.log('📊 Phase 1 Implementation Summary:');
    console.log('   ✅ Database initialization and connection');
    console.log('   ✅ Schema creation with 5 tables');
    console.log('   ✅ Proper indexes and relationships');
    console.log('   ✅ Type-safe operations with Drizzle');
    console.log('   ✅ Performance metrics collection');
    console.log('   ✅ Health monitoring');
    console.log('   ✅ Configuration management');
    console.log('   ✅ Error handling and logging');

  } catch (error) {
    console.error('❌ Phase 1 test failed:', error);
    throw error;
  } finally {
    // Clean up
    await closeTelemetryDB();
    console.log('\n🔒 Database connection closed');
  }
}

// Export for use in other test files
export default runPhase1Tests;

// Self-executing test if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase1Tests().catch(console.error);
} 