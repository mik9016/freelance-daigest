import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, initDb, schema, closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { loadCv, resetCvCacheForTest, OpenWebUIError, invalidateCvCache } from "../src/openwebui/client.js";

beforeEach(() => {
  closeDb();
  initDb(":memory:");
  runMigrations();
  resetCvCacheForTest();
});

describe("loadCv (DB-backed)", () => {
  it("returns content_text of the active CV", () => {
    db().insert(schema.cvs).values({
      filename: "a.pdf",
      contentText: "My CV text",
      contentType: "application/pdf",
      sizeBytes: 10,
      isActive: 1
    }).run();
    expect(loadCv()).toBe("My CV text");
  });

  it("throws OpenWebUIError when no active CV exists", () => {
    db().insert(schema.cvs).values({
      filename: "a.pdf",
      contentText: "Inactive",
      contentType: "application/pdf",
      sizeBytes: 10,
      isActive: 0
    }).run();
    expect(() => loadCv()).toThrow(OpenWebUIError);
    expect(() => loadCv()).toThrow(/No active CV/);
  });

  it("throws when cvs table is empty", () => {
    expect(() => loadCv()).toThrow(OpenWebUIError);
  });

  it("picks up newly activated CV after cache invalidation", () => {
    const a = db().insert(schema.cvs).values({
      filename: "a.pdf",
      contentText: "First CV",
      contentType: "application/pdf",
      sizeBytes: 10,
      isActive: 1
    }).returning().get();
    expect(loadCv()).toBe("First CV");
    const b = db().insert(schema.cvs).values({
      filename: "b.pdf",
      contentText: "Second CV",
      contentType: "application/pdf",
      sizeBytes: 10,
      isActive: 0
    }).returning().get();
    db().transaction((tx) => {
      tx.update(schema.cvs).set({ isActive: 0 }).run();
      tx.update(schema.cvs).set({ isActive: 1 }).where(eq(schema.cvs.id, b.id)).run();
    });
    invalidateCvCache();
    expect(loadCv()).toBe("Second CV");
    // cached for subsequent calls
    db().update(schema.cvs).set({ contentText: "Should not be read" }).where(eq(schema.cvs.id, a.id)).run();
    expect(loadCv()).toBe("Second CV");
  });
});