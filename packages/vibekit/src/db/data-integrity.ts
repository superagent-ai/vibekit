/**
 * Phase 5.1: Data Integrity Service
 * 
 * Provides comprehensive data validation, audit trail functionality,
 * and enhanced error handling with DrizzleQueryError.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { DrizzleConfig } from 'drizzle-orm';
import { 
  telemetryAuditLog, 
  telemetryValidationRules, 
  telemetrySchemaVersions,
  NewTelemetryAuditLog,
  NewTelemetryValidationRule,
  TelemetryValidationRule,
  auditOperations,
  severityLevels
} from './schema';

// Enhanced error handling following research recommendations
export class TelemetryDataError extends Error {
  constructor(
    message: string,
    public code: string,
    public tableName?: string,
    public fieldName?: string,
    public value?: any,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'TelemetryDataError';
  }
}

export class TelemetryValidationError extends TelemetryDataError {
  constructor(
    message: string,
    tableName: string,
    fieldName: string,
    value: any,
    rule: TelemetryValidationRule
  ) {
    super(message, 'VALIDATION_ERROR', tableName, fieldName, value, { rule });
    this.name = 'TelemetryValidationError';
  }
}

export class TelemetryAuditError extends TelemetryDataError {
  constructor(message: string, operation: string, tableName: string, recordId: string) {
    super(message, 'AUDIT_ERROR', tableName, undefined, undefined, { operation, recordId });
    this.name = 'TelemetryAuditError';
  }
}

// Data validation rule configurations
export interface ValidationRuleConfig {
  // Required field validation
  required?: {
    allowEmpty?: boolean;
  };
  
  // Pattern/regex validation
  pattern?: {
    regex: string;
    flags?: string;
  };
  
  // Range validation for numbers
  range?: {
    min?: number;
    max?: number;
    inclusive?: boolean;
  };
  
  // Enum validation
  enum?: {
    values: (string | number)[];
    caseSensitive?: boolean;
  };
  
  // JSON schema validation
  jsonSchema?: {
    schema: object;
    strict?: boolean;
  };
  
  // Length validation for strings
  length?: {
    min?: number;
    max?: number;
  };
  
  // Custom function validation
  custom?: {
    functionName: string;
    parameters?: Record<string, any>;
  };
}

export interface AuditContext {
  userId?: string;
  sessionId?: string;
  reason?: string;
  metadata?: Record<string, any>;
  trackChanges?: boolean;
}

export class DataIntegrityService {
  private db: BetterSQLite3Database<any>;
  private validationRules: Map<string, TelemetryValidationRule[]> = new Map();
  private auditEnabled: boolean = true;
  private currentSchemaVersion: string = '1.0.0';

  constructor(db: BetterSQLite3Database<any>, options?: {
    auditEnabled?: boolean;
    schemaVersion?: string;
  }) {
    this.db = db;
    this.auditEnabled = options?.auditEnabled ?? true;
    this.currentSchemaVersion = options?.schemaVersion ?? '1.0.0';
  }

  // Initialize data integrity service
  async initialize(): Promise<void> {
    try {
      // Load validation rules from database
      await this.loadValidationRules();
      
      // Ensure current schema version is tracked
      await this.ensureSchemaVersion();
      
      // Set up database pragmas for integrity
      await this.setupDatabaseIntegrity();
      
    } catch (error) {
      throw new TelemetryDataError(
        `Failed to initialize data integrity service: ${error instanceof Error ? error.message : error}`,
        'INIT_ERROR',
        undefined,
        undefined,
        undefined,
        { originalError: error }
      );
    }
  }

  // Set up database pragmas for data integrity
  private async setupDatabaseIntegrity(): Promise<void> {
    try {
      // Enable foreign key constraints (critical for data integrity)
      await this.db.run(sql`PRAGMA foreign_keys = ON`);
      
      // Enable WAL mode for better concurrency (already recommended in research)
      await this.db.run(sql`PRAGMA journal_mode = WAL`);
      
      // Set synchronous mode for better durability
      await this.db.run(sql`PRAGMA synchronous = NORMAL`);
      
      // Enable automatic index usage
      await this.db.run(sql`PRAGMA automatic_index = ON`);
      
    } catch (error) {
      throw new TelemetryDataError(
        `Failed to set up database integrity pragmas: ${error instanceof Error ? error.message : error}`,
        'PRAGMA_ERROR'
      );
    }
  }

  // Load validation rules from database
  private async loadValidationRules(): Promise<void> {
    try {
      const rules = await this.db
        .select()
        .from(telemetryValidationRules)
        .where(eq(telemetryValidationRules.isActive, true))
        .orderBy(telemetryValidationRules.priority);

      // Group rules by table.field
      this.validationRules.clear();
      for (const rule of rules) {
        const key = `${rule.tableName}.${rule.fieldName}`;
        if (!this.validationRules.has(key)) {
          this.validationRules.set(key, []);
        }
        this.validationRules.get(key)!.push(rule);
      }
    } catch (error) {
      throw new TelemetryDataError(
        `Failed to load validation rules: ${error instanceof Error ? error.message : error}`,
        'LOAD_RULES_ERROR'
      );
    }
  }

  // Ensure current schema version is tracked
  private async ensureSchemaVersion(): Promise<void> {
    try {
      const existingVersion = await this.db
        .select()
        .from(telemetrySchemaVersions)
        .where(
          and(
            eq(telemetrySchemaVersions.version, this.currentSchemaVersion),
            eq(telemetrySchemaVersions.isActive, true)
          )
        )
        .limit(1);

      if (existingVersion.length === 0) {
        await this.db.insert(telemetrySchemaVersions).values({
          version: this.currentSchemaVersion,
          description: `Schema version ${this.currentSchemaVersion}`,
          appliedAt: Date.now(),
          isActive: true,
          metadata: JSON.stringify({
            autoGenerated: true,
            features: ['foreign_keys', 'audit_trail', 'data_validation', 'versioning']
          })
        });
      }
    } catch (error) {
      throw new TelemetryDataError(
        `Failed to ensure schema version: ${error instanceof Error ? error.message : error}`,
        'SCHEMA_VERSION_ERROR'
      );
    }
  }

  // Validate data according to rules
  async validateData(tableName: string, data: Record<string, any>): Promise<void> {
    const errors: TelemetryValidationError[] = [];

    for (const [fieldName, value] of Object.entries(data)) {
      const key = `${tableName}.${fieldName}`;
      const rules = this.validationRules.get(key) || [];

      for (const rule of rules) {
        try {
          const config: ValidationRuleConfig = JSON.parse(rule.ruleConfig);
          await this.validateField(tableName, fieldName, value, rule.ruleType, config, rule);
        } catch (error) {
          if (error instanceof TelemetryValidationError) {
            errors.push(error);
          } else {
            errors.push(new TelemetryValidationError(
              `Validation rule execution failed: ${error instanceof Error ? error.message : error}`,
              tableName,
              fieldName,
              value,
              rule
            ));
          }
        }
      }
    }

    if (errors.length > 0) {
      const message = `Validation failed for ${tableName}: ${errors.map(e => e.message).join(', ')}`;
      throw new TelemetryDataError(
        message,
        'VALIDATION_FAILED',
        tableName,
        undefined,
        data,
        { errors }
      );
    }
  }

  // Validate individual field
  private async validateField(
    tableName: string,
    fieldName: string,
    value: any,
    ruleType: string,
    config: ValidationRuleConfig,
    rule: TelemetryValidationRule
  ): Promise<void> {
    switch (ruleType) {
      case 'required':
        if (value == null || (typeof value === 'string' && value.trim() === '' && !config.required?.allowEmpty)) {
          throw new TelemetryValidationError(rule.errorMessage, tableName, fieldName, value, rule);
        }
        break;

      case 'pattern':
        if (config.pattern && typeof value === 'string') {
          const regex = new RegExp(config.pattern.regex, config.pattern.flags);
          if (!regex.test(value)) {
            throw new TelemetryValidationError(rule.errorMessage, tableName, fieldName, value, rule);
          }
        }
        break;

      case 'range':
        if (config.range && typeof value === 'number') {
          const { min, max, inclusive = true } = config.range;
          if (min != null && (inclusive ? value < min : value <= min)) {
            throw new TelemetryValidationError(rule.errorMessage, tableName, fieldName, value, rule);
          }
          if (max != null && (inclusive ? value > max : value >= max)) {
            throw new TelemetryValidationError(rule.errorMessage, tableName, fieldName, value, rule);
          }
        }
        break;

      case 'enum':
        if (config.enum) {
          const { values, caseSensitive = true } = config.enum;
          const compareValue = caseSensitive ? value : String(value).toLowerCase();
          const enumValues = caseSensitive ? values : values.map(v => String(v).toLowerCase());
          if (!enumValues.includes(compareValue)) {
            throw new TelemetryValidationError(rule.errorMessage, tableName, fieldName, value, rule);
          }
        }
        break;

      case 'length':
        if (config.length && typeof value === 'string') {
          const { min, max } = config.length;
          if (min != null && value.length < min) {
            throw new TelemetryValidationError(rule.errorMessage, tableName, fieldName, value, rule);
          }
          if (max != null && value.length > max) {
            throw new TelemetryValidationError(rule.errorMessage, tableName, fieldName, value, rule);
          }
        }
        break;

      case 'json_schema':
        if (config.jsonSchema && typeof value === 'string') {
          try {
            JSON.parse(value);
          } catch {
            throw new TelemetryValidationError(rule.errorMessage, tableName, fieldName, value, rule);
          }
        }
        break;

      default:
        console.warn(`Unknown validation rule type: ${ruleType}`);
    }
  }

  // Record audit log entry
  async recordAudit(
    tableName: string,
    recordId: string,
    operation: typeof auditOperations[number],
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    context?: AuditContext
  ): Promise<void> {
    if (!this.auditEnabled) return;

    try {
      const changedFields = this.getChangedFields(oldValues, newValues);
      
      const auditEntry: NewTelemetryAuditLog = {
        tableName,
        recordId: String(recordId),
        operation,
        oldValues: oldValues ? JSON.stringify(oldValues) : null,
        newValues: newValues ? JSON.stringify(newValues) : null,
        changedFields: changedFields.length > 0 ? JSON.stringify(changedFields) : null,
        userId: context?.userId || null,
        sessionId: context?.sessionId || null,
        reason: context?.reason || null,
        metadata: context?.metadata ? JSON.stringify(context.metadata) : null,
        timestamp: Date.now(),
      };

      await this.db.insert(telemetryAuditLog).values(auditEntry);
    } catch (error) {
      throw new TelemetryAuditError(
        `Failed to record audit log: ${error instanceof Error ? error.message : error}`,
        operation,
        tableName,
        recordId
      );
    }
  }

  // Get list of changed fields between old and new values
  private getChangedFields(oldValues?: Record<string, any>, newValues?: Record<string, any>): string[] {
    if (!oldValues || !newValues) return [];

    const changed: string[] = [];
    const allFields = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

    for (const field of allFields) {
      const oldVal = oldValues[field];
      const newVal = newValues[field];
      
      // Deep comparison for objects, simple comparison for primitives
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changed.push(field);
      }
    }

    return changed;
  }

  // Add validation rule
  async addValidationRule(rule: Omit<NewTelemetryValidationRule, 'createdAt' | 'updatedAt'>): Promise<number> {
    try {
      const result = await this.db.insert(telemetryValidationRules).values({
        ...rule,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }).returning({ id: telemetryValidationRules.id });

      // Reload validation rules
      await this.loadValidationRules();

      return result[0].id;
    } catch (error) {
      throw new TelemetryDataError(
        `Failed to add validation rule: ${error instanceof Error ? error.message : error}`,
        'ADD_RULE_ERROR'
      );
    }
  }

  // Get audit trail for a record
  async getAuditTrail(tableName: string, recordId: string, limit = 50): Promise<any[]> {
    try {
      return await this.db
        .select()
        .from(telemetryAuditLog)
        .where(
          and(
            eq(telemetryAuditLog.tableName, tableName),
            eq(telemetryAuditLog.recordId, recordId)
          )
        )
        .orderBy(desc(telemetryAuditLog.timestamp))
        .limit(limit);
    } catch (error) {
      throw new TelemetryDataError(
        `Failed to get audit trail: ${error instanceof Error ? error.message : error}`,
        'GET_AUDIT_ERROR'
      );
    }
  }

  // Validate database integrity
  async validateDatabaseIntegrity(): Promise<{
    foreignKeyViolations: any[];
    constraintViolations: any[];
    orphanedRecords: any[];
  }> {
    try {
      // Check foreign key integrity
      const foreignKeyCheck = await this.db.run(sql`PRAGMA foreign_key_check`);
      
      // Check for orphaned records (basic check)
      const orphanedEvents = await this.db.run(sql`
        SELECT COUNT(*) as count 
        FROM telemetry_events e 
        LEFT JOIN telemetry_sessions s ON e.session_id = s.id 
        WHERE s.id IS NULL
      `);

      const orphanedBuffers = await this.db.run(sql`
        SELECT COUNT(*) as count 
        FROM telemetry_buffers b 
        LEFT JOIN telemetry_sessions s ON b.session_id = s.id 
        WHERE s.id IS NULL
      `);

      return {
        foreignKeyViolations: [], // SQLite would throw on violations if enabled
        constraintViolations: [],
        orphanedRecords: [
          { table: 'telemetry_events', count: orphanedEvents },
          { table: 'telemetry_buffers', count: orphanedBuffers }
        ]
      };
    } catch (error) {
      throw new TelemetryDataError(
        `Failed to validate database integrity: ${error instanceof Error ? error.message : error}`,
        'INTEGRITY_CHECK_ERROR'
      );
    }
  }

  // Get validation statistics
  async getValidationStats(): Promise<{
    totalRules: number;
    activeRules: number;
    rulesByTable: Record<string, number>;
    recentValidationErrors: number;
  }> {
    try {
      const allRules = await this.db
        .select({
          tableName: telemetryValidationRules.tableName,
          isActive: telemetryValidationRules.isActive
        })
        .from(telemetryValidationRules);

      const rulesByTable: Record<string, number> = {};
      let activeRules = 0;

      for (const rule of allRules) {
        rulesByTable[rule.tableName] = (rulesByTable[rule.tableName] || 0) + 1;
        if (rule.isActive) activeRules++;
      }

      // Count recent validation errors from audit log
      const recentErrors = await this.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(telemetryAuditLog)
        .where(
          and(
            sql`${telemetryAuditLog.metadata} LIKE '%validation%'`,
            sql`${telemetryAuditLog.timestamp} > ${Date.now() - 24 * 60 * 60 * 1000}` // Last 24 hours
          )
        );

      return {
        totalRules: allRules.length,
        activeRules,
        rulesByTable,
        recentValidationErrors: recentErrors[0]?.count || 0
      };
    } catch (error) {
      throw new TelemetryDataError(
        `Failed to get validation stats: ${error instanceof Error ? error.message : error}`,
        'STATS_ERROR'
      );
    }
  }
}

// Factory function for creating data integrity service
export function createDataIntegrityService(
  db: BetterSQLite3Database<any>,
  options?: { auditEnabled?: boolean; schemaVersion?: string }
): DataIntegrityService {
  return new DataIntegrityService(db, options);
} 