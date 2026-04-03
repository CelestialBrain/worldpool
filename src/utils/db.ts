// ─── SQLite Connection ────────────────────────────────────────────────────────
// Lazy singleton. Applies WAL mode and runs migrations on first access.

import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('db');

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

function runMigrations(db: Database.Database): void {
  const migrationsDir = join(__dirname, '../../migrations');

  // Collect all .sql files sorted numerically (001, 002, ...)
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');

    // Split on semicolons so we can run each statement individually and
    // gracefully skip "duplicate column" errors from ALTER TABLE ADD COLUMN.
    // NOTE: migration files must not contain semicolons inside string literals
    // or comments — all current migrations are simple DDL statements.
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // SQLite raises "duplicate column name" when the column already exists.
        // That means the migration already ran — safe to skip.
        if (msg.toLowerCase().includes('duplicate column')) {
          log.debug(`Skipping duplicate column in ${file}: ${msg}`);
        } else {
          throw err;
        }
      }
    }

    log.info(`Migration applied: ${file}`);
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(config.dbPath);

  // Apply WAL journal mode and NORMAL synchronous per config
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');

  runMigrations(_db);

  log.info('Database initialized', { path: config.dbPath });
  return _db;
}
