import { db } from './db.js';
import fs from 'fs';

const sql = fs.readFileSync('./drizzle/migrations/0002_create_all_tables.sql', 'utf-8');

try {
  const statements = sql.split(';').filter(s => s.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      await db.execute(statement);
      console.log('✓ Executed:', statement.substring(0, 50) + '...');
    }
  }
  console.log('\n✅ All migrations executed successfully!');
  process.exit(0);
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
