import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

try {
  // Create table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS \`body_measurements\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`chestInches\` double,
      \`waistInches\` double,
      \`hipsInches\` double,
      \`recordedAt\` bigint NOT NULL,
      \`notes\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`body_measurements_id\` PRIMARY KEY(\`id\`)
    )
  `);

  // Add foreign key
  await connection.execute(`
    ALTER TABLE \`body_measurements\` 
    ADD CONSTRAINT \`body_measurements_userId_users_id_fk\` 
    FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) 
    ON DELETE no action ON UPDATE no action
  `).catch(() => {
    // Constraint might already exist
  });

  console.log('✓ body_measurements table created successfully');
} catch (error) {
  console.error('Error creating table:', error.message);
  process.exit(1);
} finally {
  await connection.end();
}
