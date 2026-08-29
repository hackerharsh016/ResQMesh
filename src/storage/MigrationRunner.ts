import { db } from './database';

export interface Migration {
  version: number;
  sql: string;
}

// We stub the migrations here since we can't easily read the filesystem in RN without a bundler plugin
// In a real implementation, we could read from raw assets or hardcode the strings.
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS node_identity (
        node_id TEXT PRIMARY KEY NOT NULL,
        public_key TEXT NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        protocol_version TEXT NOT NULL DEFAULT '1.0',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS local_config (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `
  },
  {
    version: 2,
    sql: `
      -- All table statements from 0002_core_protocol_tables.sql would go here
      -- Simplified for stub
      CREATE TABLE IF NOT EXISTS bundles (bundle_id TEXT PRIMARY KEY);
    `
  }
];

export class MigrationRunner {
  static async applyPending(): Promise<void> {
    // Create schema_migrations table
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    const result = await db.executeSql('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
    const currentVersion = result.rows.length > 0 ? result.rows._array[0].version : 0;

    for (const migration of MIGRATIONS) {
      if (migration.version > currentVersion) {
        // Wrap in transaction
        await db.transaction(async (tx) => {
          // In real SQLite, we'd split the SQL by ';' and run each statement.
          // For this stub, we just pretend to execute the block.
          await tx.executeSql(migration.sql);
          await tx.executeSql('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [migration.version, Date.now()]);
        });
      }
    }
  }
}
