import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

function buildApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "rate_limited" }
    })
  );
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });
  return app;
}

beforeEach(() => {
  // Rate-limit memory store is per-app instance, so each buildApp() resets it.
});

describe("GET /api/health", () => {
  it("returns 200 with ok:true and ts", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ts).toBeTruthy();
  });

  it("sets helmet security headers", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    // Helmet 8 sets Cross-Origin-Resource-Policy by default
    expect(res.headers["cross-origin-resource-policy"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("does not expose x-powered-by", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("rate limiting on /api/*", () => {
  it("returns 429 after the limit is exceeded within the window", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      rateLimit({
        windowMs: 60_000,
        limit: 3,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: { error: "rate_limited" }
      })
    );
    app.get("/api/health", (_req, res) => res.json({ ok: true }));

    // First three requests succeed
    const r1 = await request(app).get("/api/health");
    const r2 = await request(app).get("/api/health");
    const r3 = await request(app).get("/api/health");
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);

    // Fourth request is blocked
    const r4 = await request(app).get("/api/health");
    expect(r4.status).toBe(429);
    expect(r4.body.error).toBe("rate_limited");
  });

  it("rate-limit block counts toward any /api route, not just /health", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      rateLimit({
        windowMs: 60_000,
        limit: 2,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: { error: "rate_limited" }
      })
    );
    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    app.get("/api/other", (_req, res) => res.json({ ok: true }));

    await request(app).get("/api/health");
    await request(app).get("/api/other");
    const r3 = await request(app).get("/api/health");
    expect(r3.status).toBe(429);
  });
});