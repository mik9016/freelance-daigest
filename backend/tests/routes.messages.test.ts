import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { eq } from "drizzle-orm";
import { db, initDb, schema, closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { messagesRouter } from "../src/routes/messages.js";

// Mock OpenWebUI client so route tests don't hit network.
vi.mock("../src/openwebui/client.js", () => ({
  generateProposal: vi.fn(),
  sendUserMessage: vi.fn(),
  OpenWebUIError: class OpenWebUIError extends Error {
    code: string;
    status?: number;
    constructor(message: string, code: string, status?: number) {
      super(message);
      this.name = "OpenWebUIError";
      this.code = code;
      this.status = status;
    }
  }
}));

import { generateProposal, sendUserMessage, OpenWebUIError } from "../src/openwebui/client.js";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/offers", messagesRouter);
  return app;
}

function seedOffer(over: Partial<typeof schema.offers.$inferInsert> = {}) {
  return db()
    .insert(schema.offers)
    .values({
      externalId: `ext-${Math.random().toString(36).slice(2)}`,
      title: "Some offer",
      detailUrl: "https://example.com/x",
      descriptionText: "desc",
      searchTerms: "[\"react\"]",
      ...over
    })
    .returning()
    .get();
}

beforeEach(() => {
  vi.clearAllMocks();
  closeDb();
  initDb(":memory:");
  runMigrations();
});

describe("POST /api/offers/:id/generate", () => {
  it("returns 404 for unknown offer", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/offers/999/generate");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("returns 400 for non-numeric id", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/offers/abc/generate");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_id");
  });

  it("returns 400 when description is empty", async () => {
    const o = seedOffer({ descriptionText: "" });
    const app = buildApp();
    const res = await request(app).post(`/api/offers/${o.id}/generate`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing_description");
  });

  it("returns 409 when a proposal (chat_messages row) already exists", async () => {
    const o = seedOffer();
    db().insert(schema.chatMessages).values({
      offerId: o.id,
      role: "assistant",
      content: "existing"
    }).run();
    const app = buildApp();
    const res = await request(app).post(`/api/offers/${o.id}/generate`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("proposal_exists");
    expect(generateProposal).not.toHaveBeenCalled();
  });

  it("returns 404 for soft-deleted (archivedAt set) offer", async () => {
    const o = seedOffer({ archivedAt: new Date().toISOString() });
    const app = buildApp();
    const res = await request(app).post(`/api/offers/${o.id}/generate`);
    expect(res.status).toBe(404);
  });

  it("returns 201 with assistant message on success", async () => {
    const o = seedOffer();
    (generateProposal as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "Sehr geehrte Damen und Herren,",
      chatId: "chat-1",
      userMessageId: 10,
      assistantMessageId: 11
    });
    const app = buildApp();
    const res = await request(app).post(`/api/offers/${o.id}/generate`);
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content).toBe("Sehr geehrte Damen und Herren,");
    expect(res.body.chatId).toBe("chat-1");
    expect(res.body.createdAt).toBeTruthy();
  });

  it("returns 502 when OpenWebUI reports auth error", async () => {
    const o = seedOffer();
    const err = new OpenWebUIError("auth failed", "auth", 401);
    (generateProposal as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const app = buildApp();
    const res = await request(app).post(`/api/offers/${o.id}/generate`);
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("ai_unavailable");
  });

  it("returns 504 on timeout from OpenWebUI", async () => {
    const o = seedOffer();
    const err = new OpenWebUIError("timed out", "timeout");
    (generateProposal as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const app = buildApp();
    const res = await request(app).post(`/api/offers/${o.id}/generate`);
    expect(res.status).toBe(504);
  });
});

describe("GET /api/offers/:id/messages", () => {
  it("returns messages sorted by createdAt ascending", async () => {
    const o = seedOffer();
    db().insert(schema.chatMessages).values([
      { offerId: o.id, role: "assistant", content: "second", createdAt: "2026-06-02T00:00:00Z" },
      { offerId: o.id, role: "user", content: "first", createdAt: "2026-06-01T00:00:00Z" }
    ]).run();
    const app = buildApp();
    const res = await request(app).get(`/api/offers/${o.id}/messages`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].content).toBe("first");
    expect(res.body[1].content).toBe("second");
  });

  it("returns 400 for non-numeric id", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/offers/abc/messages");
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown offer", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/offers/999/messages");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/offers/:id/messages", () => {
  it("returns 400 for empty body", async () => {
    const o = seedOffer();
    const app = buildApp();
    const res = await request(app).post(`/api/offers/${o.id}/messages`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("returns 400 when content exceeds 20000 chars", async () => {
    const o = seedOffer();
    const app = buildApp();
    const res = await request(app)
      .post(`/api/offers/${o.id}/messages`)
      .send({ content: "x".repeat(20001) });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown offer", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/offers/999/messages").send({ content: "hi" });
    expect(res.status).toBe(404);
  });

  it("returns 409 no_thread when no prior messages exist", async () => {
    const o = seedOffer();
    const app = buildApp();
    const res = await request(app).post(`/api/offers/${o.id}/messages`).send({ content: "hi" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("no_thread");
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("returns 201 with user+assistant on success", async () => {
    const o = seedOffer();
    db().insert(schema.chatMessages).values({
      offerId: o.id,
      role: "assistant",
      content: "existing"
    }).run();
    (sendUserMessage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 5 },
      assistant: { id: 6, content: "Sure", chatId: "c1" }
    });
    const app = buildApp();
    const res = await request(app)
      .post(`/api/offers/${o.id}/messages`)
      .send({ content: "make it shorter" });
    expect(res.status).toBe(201);
    expect(res.body.assistant.content).toBe("Sure");
  });

  it("returns 504 on timeout from OpenWebUI", async () => {
    const o = seedOffer();
    db().insert(schema.chatMessages).values({
      offerId: o.id,
      role: "assistant",
      content: "existing"
    }).run();
    const err = new OpenWebUIError("timed out", "timeout");
    (sendUserMessage as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const app = buildApp();
    const res = await request(app)
      .post(`/api/offers/${o.id}/messages`)
      .send({ content: "hi" });
    expect(res.status).toBe(504);
  });
});