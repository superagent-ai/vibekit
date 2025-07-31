#!/usr/bin/env tsx
/**
 * Database Migration Script
 * 
 * This script runs database migrations for the VibeKit telemetry database.
 * It uses Drizzle ORM's migration system to apply schema changes.
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  const dbPath = process.env.VIBEKIT_DB_PATH || '.vibekit/telemetry.db';
  const absoluteDbPath = resolve(dbPath);
  const dbDir = dirname(absoluteDbPath);
  
  console.log('🔄 Running VibeKit database migrations...');
  console.log(`📁 Database path: ${absoluteDbPath}`);
  
  try {
    // Ensure database directory exists
    if (!existsSync(dbDir)) {
      console.log(`📁 Creating database directory: ${dbDir}`);
      mkdirSync(dbDir, { recursive: true });
    }
    
    // Initialize SQLite database
    const sqlite = new Database(absoluteDbPath);
    
    // Configure SQLite for optimal performance
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('cache_size = 1000');
    sqlite.pragma('temp_store = memory');
    
    // Initialize Drizzle
    const db = drizzle(sqlite);
    
    // Run migrations
    const migrationsFolder = resolve(__dirname, '../migrations');
    console.log(`📂 Migrations folder: ${migrationsFolder}`);
    
    await migrate(db, { migrationsFolder });
    
    console.log('✅ Migrations completed successfully!');
    
    // Close database connection
    sqlite.close();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (process.argv[1] === __filename) {
  runMigrations().catch(console.error);
}

export { runMigrations };