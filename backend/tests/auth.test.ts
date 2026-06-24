import { describe, it, expect } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { authMiddleware } from "../src/middleware/auth.js";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/protected", authMiddleware, (req, res) =>
    res.json({ sub: req.user?.sub ?? null })
  );
  return app;
}

// AUTH_DISABLED is set to true in tests/setup.ts so middleware short-circuits.
// Full JWT verification with real JWKS is covered by e2e against a real/test Keycloak realm.

describe("auth middleware (AUTH_DISABLED=true in tests)", () => {
  it("lets requests through with auth-disabled mode", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/protected");
    expect(res.status).toBe(200);
  });

  it("public health route is open", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});