#!/usr/bin/env tsx
/**
 * Generate Database Migration Script
 * 
 * This script generates new migration files based on schema changes.
 * It uses Drizzle Kit to compare the current schema with the database
 * and generate the necessary SQL migrations.
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function generateMigration(name?: string) {
  console.log('🔄 Generating new migration...');
  
  try {
    // Change to the db package directory
    const dbPackageDir = resolve(__dirname, '..');
    process.chdir(dbPackageDir);
    
    // Run drizzle-kit generate command
    const command = name 
      ? `npx drizzle-kit generate --name ${name}`
      : 'npx drizzle-kit generate';
    
    console.log(`📝 Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
    
    console.log('✅ Migration generated successfully!');
    console.log('📁 Check the migrations folder for the new migration file.');
    console.log('💡 Run "npm run migrate" to apply the migration.');
    
  } catch (error) {
    console.error('❌ Failed to generate migration:', error);
    process.exit(1);
  }
}

// Get migration name from command line arguments
const migrationName = process.argv[2];

if (process.argv[1] === __filename) {
  generateMigration(migrationName);
}

export { generateMigration };