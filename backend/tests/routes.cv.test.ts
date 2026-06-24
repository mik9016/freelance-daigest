import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { eq } from "drizzle-orm";
import { db, initDb, schema, closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";

const parsePdfToText = vi.fn<(buf: Buffer) => Promise<string>>();

vi.mock("../src/cv/parse.js", () => ({
  parsePdfToText: (buf: Buffer) => parsePdfToText(buf),
  CvParseError: class extends Error {
    constructor(public code: string, msg: string) { super(msg); }
  }
}));

const { cvRouter } = await import("../src/routes/cv.js");

const PDF_MAGIC = "%PDF-1.4\n%binary\n";

function buildApp(): Express {
  const app = express();
  app.use("/api/cv", cvRouter);
  return app;
}

function seedCv(over: Partial<typeof schema.cvs.$inferInsert> = {}) {
  return db()
    .insert(schema.cvs)
    .values({
      filename: "cv.pdf",
      contentText: "Test CV content",
      contentType: "application/pdf",
      sizeBytes: 100,
      isActive: 1,
      ...over
    })
    .returning()
    .get();
}

beforeEach(() => {
  parsePdfToText.mockReset();
  parsePdfToText.mockImplementation((buf: Buffer) =>
    Promise.resolve(`extracted:${buf.subarray(0, 10).toString("utf-8")}`)
  );
  closeDb();
  initDb(":memory:");
  runMigrations();
});

describe("POST /api/cv", () => {
  it("stores PDF, marks active, deactivates others, returns metadata", async () => {
    seedCv({ filename: "old.pdf", isActive: 1 });
    const res = await request(buildApp())
      .post("/api/cv")
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", 'attachment; filename="new.pdf"')
      .send(Buffer.from(PDF_MAGIC + "Hello CV content here"));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ filename: "new.pdf", isActive: true });
    expect(res.body.size).toBeGreaterThan(0);
    expect(res.body.contentPreview).toBeDefined();
    const rows = db().select().from(schema.cvs).all();
    expect(rows).toHaveLength(2);
    const active = rows.filter((r) => r.isActive);
    expect(active).toHaveLength(1);
    expect(active[0]!.filename).toBe("new.pdf");
  });

  it("rejects missing body with 400 missing_file", async () => {
    const res = await request(buildApp()).post("/api/cv").set("Content-Type", "application/pdf").send("");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing_file");
  });

  it("rejects non-pdf content-type with 400 invalid_content_type", async () => {
    const res = await request(buildApp())
      .post("/api/cv")
      .set("Content-Type", "application/json")
      .send("{}");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_content_type");
  });

  it("rejects parse failure (empty_pdf) with 422", async () => {
    const { CvParseError } = await import("../src/cv/parse.js");
    parsePdfToText.mockRejectedValueOnce(new CvParseError("empty_pdf", "empty"));
    const res = await request(buildApp())
      .post("/api/cv")
      .set("Content-Type", "application/pdf")
      .send(Buffer.from(PDF_MAGIC + "x"));
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("empty_pdf");
  });

  it("rejects parse failure (invalid_pdf) with 422", async () => {
    const { CvParseError } = await import("../src/cv/parse.js");
    parsePdfToText.mockRejectedValueOnce(new CvParseError("invalid_pdf", "bad"));
    const res = await request(buildApp())
      .post("/api/cv")
      .set("Content-Type", "application/pdf")
      .send(Buffer.from(PDF_MAGIC + "x"));
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("invalid_pdf");
  });

  it("rejects oversize content-length with 413 file_too_large", async () => {
    const res = await request(buildApp())
      .post("/api/cv")
      .set("Content-Type", "application/pdf")
      .set("Content-Length", String(6 * 1024 * 1024))
      .send(Buffer.from(PDF_MAGIC));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("file_too_large");
  });

  it("sanitizes path-traversal filenames", async () => {
    const res = await request(buildApp())
      .post("/api/cv")
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", 'attachment; filename="../../etc/passwd"')
      .send(Buffer.from(PDF_MAGIC + "x"));
    expect(res.status).toBe(201);
    expect(res.body.filename).toBe("._._etc_passwd");
    expect(res.body.filename).not.toContain("/");
    expect(res.body.filename).not.toContain("\\");
  });
});

describe("GET /api/cv", () => {
  it("returns active CV metadata without content preview", async () => {
    seedCv({ filename: "active.pdf", contentText: "Some longer CV content here", isActive: 1 });
    const res = await request(buildApp()).get("/api/cv");
    expect(res.status).toBe(200);
    expect(res.body.filename).toBe("active.pdf");
    expect(res.body.isActive).toBe(true);
    expect(res.body.contentPreview).toBeUndefined();
  });

  it("returns 404 no_active_cv when none active", async () => {
    const res = await request(buildApp()).get("/api/cv");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("no_active_cv");
  });
});

describe("GET /api/cv/history", () => {
  it("returns all CVs newest-first without contentText or contentPreview", async () => {
    const a = seedCv({ filename: "a.pdf", isActive: 1 });
    const b = seedCv({ filename: "b.pdf", isActive: 0 });
    const all = db().select().from(schema.cvs).all();
    expect(all).toHaveLength(2);
    const res = await request(buildApp()).get("/api/cv/history");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].contentPreview).toBeUndefined();
  });
});

describe("PATCH /api/cv/:id/activate", () => {
  it("marks one active, deactivates rest (idempotent)", async () => {
    const a = seedCv({ filename: "a.pdf", isActive: 1 });
    const b = seedCv({ filename: "b.pdf", isActive: 0 });
    const res = await request(buildApp()).patch(`/api/cv/${b.id}/activate`);
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);
    const rows = db().select().from(schema.cvs).all();
    const active = rows.filter((r) => r.isActive);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(b.id);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(buildApp()).patch("/api/cv/9999/activate");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid id", async () => {
    const res = await request(buildApp()).patch("/api/cv/abc/activate");
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/cv/:id", () => {
  it("removes inactive CV without changing active", async () => {
    const a = seedCv({ filename: "a.pdf", isActive: 1 });
    const b = seedCv({ filename: "b.pdf", isActive: 0 });
    const res = await request(buildApp()).delete(`/api/cv/${b.id}`);
    expect(res.status).toBe(204);
    const rows = db().select().from(schema.cvs).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(a.id);
    expect(rows[0]!.isActive).toBe(1);
  });

  it("auto-activates newest remaining when deleting active", async () => {
    const a = seedCv({ filename: "a.pdf", isActive: 1 });
    const b = seedCv({ filename: "b.pdf", isActive: 0 });
    const res = await request(buildApp()).delete(`/api/cv/${a.id}`);
    expect(res.status).toBe(204);
    const rows = db().select().from(schema.cvs).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(b.id);
    expect(rows[0]!.isActive).toBe(1);
  });

  it("leaves table empty when deleting the only CV", async () => {
    const a = seedCv({ filename: "a.pdf", isActive: 1 });
    const res = await request(buildApp()).delete(`/api/cv/${a.id}`);
    expect(res.status).toBe(204);
    const rows = db().select().from(schema.cvs).all();
    expect(rows).toHaveLength(0);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(buildApp()).delete("/api/cv/9999");
    expect(res.status).toBe(404);
  });
});