import { createClient } from '@libsql/client';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure local data directory exists
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let clientInstance = null;
let configured = false;
const transactionStorage = new AsyncLocalStorage();

export function getDb() {
  if (!clientInstance) {
    const url = process.env.TURSO_DATABASE_URL || process.env.DB_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (url) {
      console.log(`[Database] Connecting to Turso Cloud Database: ${url.replace(/\/\/[^:]+@/, '//***@')}`);
      clientInstance = createClient({
        url,
        authToken,
      });
    } else {
      const localDbPath = process.env.DB_PATH || path.join(dataDir, 'krushipos.db');
      console.log(`[Database] Using Local SQLite Database: ${localDbPath}`);
      clientInstance = createClient({
        url: `file:${localDbPath.replace(/\\/g, '/')}`,
      });
    }
  }

  if (!configured && clientInstance) {
    configured = true;
    // Set WAL mode, busy timeout, and foreign keys asynchronously
    Promise.all([
      clientInstance.execute('PRAGMA journal_mode = WAL;').catch(() => {}),
      clientInstance.execute('PRAGMA busy_timeout = 10000;').catch(() => {}),
      clientInstance.execute('PRAGMA foreign_keys = ON;').catch(() => {}),
      clientInstance.execute('PRAGMA synchronous = NORMAL;').catch(() => {})
    ]).catch(() => {});
  }

  return clientInstance;
}

function getExecutor() {
  return transactionStorage.getStore() || getDb();
}

/**
 * Execute a query that returns multiple rows
 */
export async function queryAll(sql, params = []) {
  const executor = getExecutor();
  const res = await executor.execute({ sql, args: params });
  return res.rows;
}

/**
 * Execute a query that returns a single row
 */
export async function queryOne(sql, params = []) {
  const executor = getExecutor();
  const res = await executor.execute({ sql, args: params });
  return res.rows[0] || null;
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement
 */
export async function run(sql, params = []) {
  const executor = getExecutor();
  const res = await executor.execute({ sql, args: params });
  return {
    lastInsertRowid: res.lastInsertRowid != null ? Number(res.lastInsertRowid) : null,
    changes: res.rowsAffected || 0,
  };
}

/**
 * Execute multiple statements in an ACID transaction
 */
export async function transaction(callback) {
  const currentTx = transactionStorage.getStore();
  if (currentTx) {
    // Nested inside existing transaction
    return await callback();
  }

  const db = getDb();
  const tx = await db.transaction('write');
  try {
    const result = await transactionStorage.run(tx, async () => {
      return await callback();
    });
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw error;
  }
}

/**
 * Execute multiple SQL statements (for schema setup)
 */
export async function executeMultiple(sql) {
  const db = getDb();
  return await db.executeMultiple(sql);
}

export default {
  getDb,
  queryAll,
  queryOne,
  run,
  transaction,
  executeMultiple,
};
