import express, { Router, type Request, type Response, type NextFunction } from "express";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { invalidateCvCache } from "../openwebui/client.js";
import { parsePdfToText, CvParseError } from "../cv/parse.js";

export const cvRouter = Router();

const MAX_BYTES = 5 * 1024 * 1024;
const PREVIEW_LEN = 500;
const MAX_FILENAME_LEN = 200;

cvRouter.use(authMiddleware);

cvRouter.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/") {
    const len = Number(req.headers["content-length"] ?? 0);
    if (Number.isFinite(len) && len > MAX_BYTES) {
      res.status(413).json({ error: "file_too_large" });
      return;
    }
    express.raw({ type: "application/pdf", limit: MAX_BYTES + 1024 })(req, res, next);
  } else {
    next();
  }
});

interface CvMeta {
  id: number;
  filename: string;
  size: number;
  contentType: string;
  createdAt: string;
  isActive: boolean;
  contentPreview?: string;
}

function toMeta(row: typeof schema.cvs.$inferSelect, withPreview = false): CvMeta {
  return {
    id: row.id,
    filename: row.filename,
    size: row.sizeBytes,
    contentType: row.contentType,
    createdAt: row.createdAt,
    isActive: Boolean(row.isActive),
    ...(withPreview ? { contentPreview: row.contentText.slice(0, PREVIEW_LEN) } : {})
  };
}

function parseFilename(header: string | undefined): string {
  if (!header) return "cv.pdf";
  const starMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (starMatch) {
    try { return decodeURIComponent(starMatch[1]!) || "cv.pdf"; } catch { /* fallthrough */ }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1]!.trim();
  return "cv.pdf";
}

function sanitizeFilename(name: string): string {
  const stripped = name
    .replace(/[\\/]+/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
  const limited = stripped.length > MAX_FILENAME_LEN ? stripped.slice(0, MAX_FILENAME_LEN) : stripped;
  return limited || "cv.pdf";
}

cvRouter.post("/", async (req: Request, res: Response) => {
  const ct = (req.headers["content-type"] ?? "").toLowerCase();
  if (ct !== "application/pdf") {
    res.status(400).json({ error: "invalid_content_type" });
    return;
  }
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    res.status(400).json({ error: "missing_file" });
    return;
  }
  if (buf.length > MAX_BYTES) {
    res.status(413).json({ error: "file_too_large" });
    return;
  }
  let text: string;
  try {
    text = await parsePdfToText(buf);
  } catch (err) {
    if (err instanceof CvParseError) {
      const status =
        err.code === "invalid_pdf" || err.code === "empty_pdf" || err.code === "pdf_password" ? 422 : 500;
      res.status(status).json({ error: err.code });
      return;
    }
    throw err;
  }
  const filename = sanitizeFilename(parseFilename(req.headers["content-disposition"]));
  const row = db().transaction((tx) => {
    tx.update(schema.cvs).set({ isActive: 0 }).run();
    return tx
      .insert(schema.cvs)
      .values({
        filename,
        contentText: text,
        contentType: "application/pdf",
        sizeBytes: buf.length,
        isActive: 1
      })
      .returning()
      .get();
  });
  invalidateCvCache();
  res.status(201).json(toMeta(row, true));
});

cvRouter.get("/", (_req, res) => {
  const row = db().select().from(schema.cvs).where(eq(schema.cvs.isActive, 1)).get();
  if (!row) {
    res.status(404).json({ error: "no_active_cv" });
    return;
  }
  res.json(toMeta(row));
});

cvRouter.get("/history", (_req, res) => {
  const rows = db().select().from(schema.cvs).orderBy(desc(schema.cvs.id)).all();
  res.json(rows.map((r) => toMeta(r, false)));
});

cvRouter.patch("/:id/activate", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const result = db().transaction((tx) => {
    const row = tx.select().from(schema.cvs).where(eq(schema.cvs.id, id)).get();
    if (!row) return null;
    tx.update(schema.cvs).set({ isActive: 0 }).run();
    tx.update(schema.cvs).set({ isActive: 1 }).where(eq(schema.cvs.id, id)).run();
    return tx.select().from(schema.cvs).where(eq(schema.cvs.id, id)).get();
  });
  if (!result) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  invalidateCvCache();
  res.status(200).json(toMeta(result));
});

cvRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const deleted = db().transaction((tx) => {
    const row = tx.select().from(schema.cvs).where(eq(schema.cvs.id, id)).get();
    if (!row) return false;
    const info = tx.delete(schema.cvs).where(eq(schema.cvs.id, id)).run();
    if (info.changes === 0) return false;
    if (row.isActive) {
      const next = tx.select().from(schema.cvs).orderBy(desc(schema.cvs.id)).get();
      if (next) tx.update(schema.cvs).set({ isActive: 1 }).where(eq(schema.cvs.id, next.id)).run();
    }
    return true;
  });
  if (!deleted) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  invalidateCvCache();
  res.status(204).send();
});

cvRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if ((err as { type?: string })?.type === "entity.too.large") {
    res.status(413).json({ error: "file_too_large" });
    return;
  }
  next(err);
});