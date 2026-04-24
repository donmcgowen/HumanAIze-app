#!/usr/bin/env node
/**
 * Initialize Neon PostgreSQL tables for HumanAIze
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const NEON_URL = process.env.NEON_DATABASE_URL || process.argv[2];
if (!NEON_URL) {
  console.error('Usage: node init_neon.js <neon_connection_string>');
  process.exit(1);
}

async function main() {
  const sql = neon(NEON_URL);
  const ddl = fs.readFileSync(path.join(__dirname, '../drizzle/neon_init.sql'), 'utf8');
  
  // Split on semicolons but keep DO $$ blocks together
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  
  for (const line of ddl.split('\n')) {
    if (line.trim().startsWith('DO $$')) inDollarQuote = true;
    if (line.trim() === 'END $$;') {
      inDollarQuote = false;
      current += line + '\n';
      statements.push(current.trim());
      current = '';
      continue;
    }
    if (!inDollarQuote && line.trim().endsWith(';') && !line.trim().startsWith('--')) {
      current += line + '\n';
      statements.push(current.trim());
      current = '';
    } else {
      current += line + '\n';
    }
  }
  
  let created = 0;
  for (const stmt of statements) {
    if (!stmt.trim() || stmt.trim().startsWith('--')) continue;
    try {
      await sql.unsafe(stmt);
      if (stmt.includes('CREATE TABLE')) {
        const match = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        if (match) { console.log(`  ✓ Table: ${match[1]}`); created++; }
      } else if (stmt.includes('CREATE INDEX')) {
        const match = stmt.match(/CREATE INDEX IF NOT EXISTS (\w+)/);
        if (match) console.log(`  ✓ Index: ${match[1]}`);
      } else if (stmt.includes('CREATE TYPE')) {
        console.log(`  ✓ Enum created`);
      }
    } catch (err) {
      if (err.message && err.message.includes('already exists')) {
        // OK — table already exists
      } else {
        console.warn(`  ⚠ Warning on statement: ${err.message}`);
      }
    }
  }
  
  console.log(`\nNeon initialization complete. ${created} tables ready.`);
  
  // Verify
  const tables = await sql`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY tablename
  `;
  console.log('\nTables in Neon:');
  tables.forEach(t => console.log(`  - ${t.tablename}`));
}

main().catch(e => { console.error('Init failed:', e); process.exit(1); });
