import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import * as schema from "./schema.js";

let dbInstance: BetterSQLite3Database<typeof schema> | null = null;
let sqliteInstance: Database.Database | null = null;

function parseSqliteUrl(url: string): string {
  if (url.startsWith("file:")) {
    return url.slice("file:".length);
  }
  return url;
}

export function initDb(path?: string): BetterSQLite3Database<typeof schema> {
  if (dbInstance) return dbInstance;
  const dbPath = parseSqliteUrl(path ?? config().DATABASE_URL);
  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma("journal_mode = WAL");
  sqliteInstance.pragma("foreign_keys = ON");
  dbInstance = drizzle(sqliteInstance, { schema });
  return dbInstance;
}

export function db(): BetterSQLite3Database<typeof schema> {
  if (!dbInstance) {
    return initDb();
  }
  return dbInstance;
}

export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

export { schema };