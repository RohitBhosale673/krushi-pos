import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'krushipos.db');

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(dbPath);
    // Enable WAL mode for high concurrency and performance
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    // Enforce foreign key constraints
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA synchronous = NORMAL;');
  }
  return dbInstance;
}

/**
 * Execute a query that returns multiple rows
 */
export function queryAll(sql, params = []) {
  const db = getDb();
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

/**
 * Execute a query that returns a single row
 */
export function queryOne(sql, params = []) {
  const db = getDb();
  const stmt = db.prepare(sql);
  return stmt.get(...params) || null;
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement
 */
export function run(sql, params = []) {
  const db = getDb();
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

/**
 * Execute multiple statements in an ACID transaction
 */
export function transaction(callback) {
  const db = getDb();
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = callback(db);
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

export default {
  getDb,
  queryAll,
  queryOne,
  run,
  transaction,
};
