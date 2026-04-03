// ─── SQLite Connection ────────────────────────────────────────────────────────
// Lazy singleton. Applies WAL mode and runs migrations on first access.

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('db');

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

function runMigrations(db: Database.Database): void {
  const migrationPath = join(__dirname, '../../migrations/001_init.sql');
  const sql = readFileSync(migrationPath, 'utf-8');
  db.exec(sql);
  log.info('Migrations applied');
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
