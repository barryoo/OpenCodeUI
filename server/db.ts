import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'

export interface DatabaseContext {
  db: Database
}

function ensureParentDirectory(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/')
  const slashIndex = normalized.lastIndexOf('/')
  if (slashIndex <= 0) return
  const parentPath = normalized.slice(0, slashIndex)
  mkdirSync(parentPath, { recursive: true })
}

export function createDatabaseContext(databasePath: string): DatabaseContext {
  ensureParentDirectory(databasePath)
  const db = new Database(databasePath, { create: true })

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  return { db }
}
