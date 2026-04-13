import mysql from 'mysql2/promise';
import fs from 'fs';
import { URL } from 'url';

const dbUrl = new URL(process.env.DATABASE_URL);
const sql = fs.readFileSync('./drizzle/migrations/0002_create_all_tables.sql', 'utf-8');

const connection = await mysql.createConnection({
  host: dbUrl.hostname,
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1),
  ssl: 'Amazon RDS',
});

try {
  // Split SQL by semicolon and execute each statement
  const statements = sql.split(';').filter(s => s.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      await connection.execute(statement);
      console.log('✓ Executed:', statement.substring(0, 50) + '...');
    }
  }
  console.log('\n✅ All migrations executed successfully!');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  await connection.end();
}
