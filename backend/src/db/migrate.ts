import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { initDb } from "./client.js";
import { logger } from "../lib/logger.js";

export function runMigrations(): void {
  const db = initDb();
  try {
    migrate(db, { migrationsFolder: "./drizzle" });
    logger.info("Migrations applied");
  } catch (err) {
    logger.error({ err }, "Migration failed; continuing with manual schema bootstrap");
    bootstrapSchema();
  }
}

/**
 * Fallback for first-run in container where drizzle/ may not be present.
 * Creates tables if they don't exist.
 */
function bootstrapSchema(): void {
  const db = initDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      company TEXT,
      location TEXT,
      remote_pct INTEGER NOT NULL DEFAULT 0,
      contract_type TEXT,
      duration TEXT,
      start_date TEXT,
      posted_at TEXT,
      detail_url TEXT NOT NULL,
      description_text TEXT NOT NULL DEFAULT '',
      raw_html TEXT NOT NULL DEFAULT '',
      search_terms TEXT NOT NULL DEFAULT '[]',
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      sent INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      openwebui_chat_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      openwebui_chat_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_term TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      new_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS cvs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      content_text TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/pdf',
      size_bytes INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}