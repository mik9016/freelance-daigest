import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";

// Mock the cron module so we can control started/running state without firing
// a real scrape in the background.
vi.mock("../src/jobs/cron.js", () => ({
  isScrapeRunning: vi.fn(() => false),
  triggerScrape: vi.fn(() => ({ started: true })),
  getScrapeProgress: vi.fn(() => ({
    running: false,
    startedAt: null,
    finishedAt: null,
    terms: [],
    currentTerm: null,
    pageIndex: 0,
    maxPages: 0,
    fetched: 0,
    persisted: 0,
    updated: 0,
    skipped: 0,
    errors: []
  })),
  startCron: vi.fn(),
  stopCron: vi.fn()
}));

import { scrapeRouter } from "../src/routes/scrape.js";
import { requireRole } from "../src/middleware/auth.js";
import { triggerScrape, isScrapeRunning, getScrapeProgress } from "../src/jobs/cron.js";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/scrape", scrapeRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  (isScrapeRunning as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
  (triggerScrape as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ started: true });
});

describe("POST /api/scrape/run", () => {
  it("returns 202 when scrape starts (admin role via AUTH_DISABLED)", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/scrape/run");
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "started" });
    expect(triggerScrape).toHaveBeenCalled();
  });

  it("returns 409 when a scrape is already in progress", async () => {
    (triggerScrape as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      started: false,
      reason: "scrape_in_progress"
    });
    const app = buildApp();
    const res = await request(app).post("/api/scrape/run");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("scrape_in_progress");
  });

  it("returns 403 when user role is not admin", async () => {
    // Build a minimal app that simulates an authenticated non-admin user
    // reaching the requireRole("admin") gate. AUTH_DISABLED in tests always
    // grants admin via authMiddleware, so we exercise requireRole directly.
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { sub: "u1", roles: ["user"], raw: {} };
      next();
    });
    app.post("/api/scrape/run", requireRole("admin"), (_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(app).post("/api/scrape/run");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("allows admin role through requireRole", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { sub: "u1", roles: ["admin", "other"], raw: {} };
      next();
    });
    app.post("/api/scrape/run", requireRole("admin"), (_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(app).post("/api/scrape/run");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 403 when no user is present", async () => {
    const app = express();
    app.use(express.json());
    app.post("/api/scrape/run", requireRole("admin"), (_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(app).post("/api/scrape/run");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/scrape/status", () => {
  it("returns running=false when no scrape in progress", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/scrape/status");
    expect(res.status).toBe(200);
    expect(res.body.running).toBe(false);
  });

  it("returns running=true when scrape in progress", async () => {
    (getScrapeProgress as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      running: true,
      startedAt: "2026-06-24T00:00:00Z",
      finishedAt: null,
      terms: ["react"],
      currentTerm: "react",
      pageIndex: 1,
      maxPages: 1,
      fetched: 5,
      persisted: 3,
      updated: 0,
      skipped: 0,
      errors: []
    });
    const app = buildApp();
    const res = await request(app).get("/api/scrape/status");
    expect(res.status).toBe(200);
    expect(res.body.running).toBe(true);
    expect(res.body.currentTerm).toBe("react");
    expect(res.body.fetched).toBe(5);
  });
});