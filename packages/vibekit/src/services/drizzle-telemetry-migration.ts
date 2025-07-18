/**
 * Phase 4: Production Integration - Legacy TelemetryDB Migration
 * 
 * This service handles the migration from legacy TelemetryDB to DrizzleTelemetryService
 * while maintaining backward compatibility and enabling smooth production deployment.
 */

import { DrizzleTelemetryService } from '../db';
import { TelemetryDB } from './telemetry-db';
import { TelemetryConfig } from '../types';
import { TelemetryRecord } from '../types/telemetry-storage';

interface MigrationProgress {
  status: 'idle' | 'running' | 'completed' | 'failed';
  totalRecords: number;
  migratedRecords: number;
  errors: string[];
  startTime?: number;
  endTime?: number;
  estimatedTimeRemaining?: number;
}

interface MigrationOptions {
  batchSize?: number;
  preserveLegacyData?: boolean;
  validateAfterMigration?: boolean;
  enableProgressReporting?: boolean;
  continueOnError?: boolean;
}

export class DrizzleTelemetryMigrationService {
  private legacyDb?: TelemetryDB;
  private drizzleService?: DrizzleTelemetryService;
  private progress: MigrationProgress;
  private options: Required<MigrationOptions>;

  constructor(
    private config: TelemetryConfig,
    options: MigrationOptions = {}
  ) {
    this.options = {
      batchSize: options.batchSize || 100,
      preserveLegacyData: options.preserveLegacyData || true,
      validateAfterMigration: options.validateAfterMigration || true,
      enableProgressReporting: options.enableProgressReporting || true,
      continueOnError: options.continueOnError || false,
    };

    this.progress = {
      status: 'idle',
      totalRecords: 0,
      migratedRecords: 0,
      errors: [],
    };
  }

  /**
   * Check if migration is needed by detecting legacy data
   */
  async isMigrationNeeded(): Promise<boolean> {
    try {
      if (!this.config.localStore?.isEnabled) {
        return false;
      }

      // Initialize legacy DB to check for existing data
      this.legacyDb = new TelemetryDB(this.config.localStore);
      
      // Check if legacy database has data
      const legacyData = await this.legacyDb.getEvents({ limit: 1 });
      
      if (legacyData.length === 0) {
        return false; // No legacy data to migrate
      }

      // Initialize Drizzle service with TelemetryConfig
      this.drizzleService = new DrizzleTelemetryService(this.config);

      // Get statistics via the operations interface
      const drizzleStats = await this.getStatisticsFromDrizzleService();
      
      return drizzleStats.totalEvents === 0 && legacyData.length > 0;
    } catch (error) {
      console.warn('Failed to check migration status:', error);
      return false;
    }
  }

  /**
   * Get statistics from Drizzle service via its operations
   */
  private async getStatisticsFromDrizzleService(): Promise<{ totalEvents: number }> {
    if (!this.drizzleService) {
      throw new Error('Drizzle service not initialized');
    }

    // Access the operations through the service's private field
    // Note: This is a workaround since the service doesn't expose statistics directly
    const operations = (this.drizzleService as any).dbOps;
    if (!operations) {
      // If operations not available, assume empty database
      return { totalEvents: 0 };
    }

    try {
      const stats = await operations.getStatistics();
      return { totalEvents: stats.totalEvents };
    } catch (error) {
      console.warn('Failed to get Drizzle statistics:', error);
      return { totalEvents: 0 };
    }
  }

  /**
   * Perform the migration from legacy to Drizzle
   */
  async performMigration(): Promise<MigrationProgress> {
    if (this.progress.status === 'running') {
      throw new Error('Migration is already in progress');
    }

    this.progress = {
      status: 'running',
      totalRecords: 0,
      migratedRecords: 0,
      errors: [],
      startTime: Date.now(),
    };

    try {
      await this.setupMigration();
      await this.migrateData();
      
      if (this.options.validateAfterMigration) {
        await this.validateMigration();
      }

      this.progress.status = 'completed';
      this.progress.endTime = Date.now();

      if (this.options.enableProgressReporting) {
        this.logMigrationSummary();
      }

    } catch (error) {
      this.progress.status = 'failed';
      this.progress.endTime = Date.now();
      this.progress.errors.push(error instanceof Error ? error.message : String(error));
      
      console.error('Migration failed:', error);
      throw error;
    }

    return this.progress;
  }

  /**
   * Get current migration progress
   */
  getMigrationProgress(): MigrationProgress {
    return { ...this.progress };
  }

  /**
   * Initialize migration services
   */
  private async setupMigration(): Promise<void> {
    if (!this.config.localStore?.isEnabled) {
      throw new Error('Local store is not enabled in configuration');
    }

    // Initialize legacy DB if not already done
    if (!this.legacyDb) {
      this.legacyDb = new TelemetryDB(this.config.localStore);
    }

    // Initialize Drizzle service if not already done
    if (!this.drizzleService) {
      this.drizzleService = new DrizzleTelemetryService(this.config);
    }

    // Count total records for progress tracking
    const allLegacyData = await this.legacyDb.getEvents({ limit: 1000000 });
    this.progress.totalRecords = allLegacyData.length;

    if (this.options.enableProgressReporting) {
      console.log(`Starting migration of ${this.progress.totalRecords} records...`);
    }
  }

  /**
   * Migrate data in batches
   */
  private async migrateData(): Promise<void> {
    if (!this.legacyDb || !this.drizzleService) {
      throw new Error('Migration services not initialized');
    }

    let offset = 0;
    const batchSize = this.options.batchSize;

    while (offset < this.progress.totalRecords) {
      try {
        // Get batch of legacy records
        const batch = await this.legacyDb.getEvents({
          limit: batchSize,
          // Simple offset-based pagination (not ideal for large datasets but sufficient for migration)
        });

        if (batch.length === 0) {
          break; // No more data
        }

        // Process each record in the batch
        const recordsToProcess = batch.slice(offset, offset + batchSize);
        for (const legacyRecord of recordsToProcess) {
          await this.migrateSingleRecord(legacyRecord);
        }

        this.progress.migratedRecords += recordsToProcess.length;
        offset += batchSize;

        // Calculate estimated time remaining
        if (this.progress.startTime) {
          const elapsed = Date.now() - this.progress.startTime;
          const rate = this.progress.migratedRecords / elapsed; // records per ms
          const remaining = this.progress.totalRecords - this.progress.migratedRecords;
          this.progress.estimatedTimeRemaining = Math.round(remaining / rate);
        }

        // Progress reporting
        if (this.options.enableProgressReporting && this.progress.migratedRecords % (batchSize * 5) === 0) {
          const percentage = Math.round((this.progress.migratedRecords / this.progress.totalRecords) * 100);
          const eta = this.progress.estimatedTimeRemaining ? `${Math.round(this.progress.estimatedTimeRemaining / 1000)}s` : 'unknown';
          console.log(`Migration progress: ${percentage}% (${this.progress.migratedRecords}/${this.progress.totalRecords}), ETA: ${eta}`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.progress.errors.push(`Batch ${Math.floor(offset / batchSize)}: ${errorMessage}`);

        if (this.options.continueOnError) {
          console.warn(`Migration error in batch ${Math.floor(offset / batchSize)}, continuing:`, error);
          offset += batchSize; // Skip this batch
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Migrate a single legacy record using the appropriate DrizzleTelemetryService method
   */
  private async migrateSingleRecord(legacyRecord: TelemetryRecord): Promise<void> {
    if (!this.drizzleService) {
      throw new Error('Drizzle service not initialized');
    }

    const baseData = {
      sessionId: legacyRecord.sessionId,
      agentType: legacyRecord.agentType,
      mode: legacyRecord.mode,
      prompt: legacyRecord.prompt,
      sandboxId: legacyRecord.sandboxId,
      repoUrl: legacyRecord.repoUrl,
      metadata: legacyRecord.metadata,
    };

    // Use the appropriate tracking method based on event type
    switch (legacyRecord.eventType) {
      case 'start':
        await this.drizzleService.trackStart({
          ...baseData,
        });
        break;
      
      case 'stream':
        await this.drizzleService.trackStream({
          ...baseData,
          streamData: legacyRecord.streamData || '',
        });
        break;
      
      case 'end':
        await this.drizzleService.trackEnd({
          ...baseData,
        });
        break;
      
      case 'error':
        await this.drizzleService.trackError({
          ...baseData,
          error: legacyRecord.metadata?.['error.message'] || 'Unknown error',
        });
        break;
      
      default:
        console.warn(`Unknown event type: ${legacyRecord.eventType}, skipping record`);
    }
  }

  /**
   * Validate migration by comparing record counts
   */
  private async validateMigration(): Promise<void> {
    if (!this.legacyDb || !this.drizzleService) {
      throw new Error('Migration services not initialized');
    }

    const legacyStats = await this.getLegacyStats();
    const drizzleStats = await this.getStatisticsFromDrizzleService();

    const tolerance = Math.max(1, Math.floor(this.progress.totalRecords * 0.001)); // 0.1% tolerance

    if (Math.abs(legacyStats.totalEvents - drizzleStats.totalEvents) > tolerance) {
      throw new Error(
        `Migration validation failed: Legacy DB has ${legacyStats.totalEvents} events, ` +
        `Drizzle DB has ${drizzleStats.totalEvents} events`
      );
    }

    if (this.options.enableProgressReporting) {
      console.log('Migration validation passed ✅');
    }
  }

  /**
   * Get basic statistics from legacy database
   */
  private async getLegacyStats(): Promise<{ totalEvents: number }> {
    if (!this.legacyDb) {
      throw new Error('Legacy DB not initialized');
    }

    const allEvents = await this.legacyDb.getEvents({ limit: 1000000 });
    return { totalEvents: allEvents.length };
  }

  /**
   * Log migration summary
   */
  private logMigrationSummary(): void {
    const duration = this.progress.endTime && this.progress.startTime 
      ? this.progress.endTime - this.progress.startTime 
      : 0;

    console.log('📊 Migration Summary:');
    console.log(`   Status: ${this.progress.status}`);
    console.log(`   Records migrated: ${this.progress.migratedRecords}/${this.progress.totalRecords}`);
    console.log(`   Duration: ${Math.round(duration / 1000)}s`);
    console.log(`   Rate: ${Math.round(this.progress.migratedRecords / (duration / 1000))} records/sec`);
    
    if (this.progress.errors.length > 0) {
      console.log(`   Errors: ${this.progress.errors.length}`);
      this.progress.errors.forEach((error, index) => {
        console.log(`     ${index + 1}. ${error}`);
      });
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.legacyDb) {
        await this.legacyDb.close();
      }
      if (this.drizzleService) {
        await this.drizzleService.shutdown();
      }
    } catch (error) {
      console.warn('Failed to cleanup migration resources:', error);
    }
  }

  /**
   * Create a production-ready TelemetryService replacement
   */
  static async createProductionTelemetryService(config: TelemetryConfig): Promise<DrizzleTelemetryService> {
    if (!config.localStore?.isEnabled) {
      throw new Error('Local store must be enabled for Drizzle telemetry service');
    }

    // Check if migration is needed
    const migrationService = new DrizzleTelemetryMigrationService(config);
    const needsMigration = await migrationService.isMigrationNeeded();

    if (needsMigration) {
      console.log('🔄 Legacy telemetry data detected, performing migration...');
      await migrationService.performMigration();
      console.log('✅ Migration completed successfully');
    }

    // Create and return Drizzle service
    const drizzleService = new DrizzleTelemetryService(config);
    
    await migrationService.cleanup();
    
    return drizzleService;
  }
} 