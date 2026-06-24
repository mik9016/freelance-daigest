import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { eq } from "drizzle-orm";
import { db, initDb, schema, closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { offersRouter } from "../src/routes/offers.js";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/offers", offersRouter);
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
  closeDb();
  initDb(":memory:");
  runMigrations();
});

describe("GET /api/offers", () => {
  it("returns active (non-archived) by default", async () => {
    const a = seedOffer({ title: "A" });
    seedOffer({ title: "B", archived: 1 });
    const app = buildApp();
    const res = await request(app).get("/api/offers");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(a.id);
  });

  it("filter=archived returns archived only", async () => {
    seedOffer({ title: "A" });
    const b = seedOffer({ title: "B", archived: 1 });
    const app = buildApp();
    const res = await request(app).get("/api/offers?filter=archived");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(b.id);
  });

  it("filter=sent returns sent only", async () => {
    seedOffer({ title: "A" });
    const b = seedOffer({ title: "B", sent: 1, sentAt: new Date().toISOString() });
    const app = buildApp();
    const res = await request(app).get("/api/offers?filter=sent");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(b.id);
  });

  it("filter=unsent returns unsent only", async () => {
    seedOffer({ title: "A" });
    seedOffer({ title: "B", sent: 1, sentAt: new Date().toISOString() });
    const app = buildApp();
    const res = await request(app).get("/api/offers?filter=unsent");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("A");
  });

  it("filter=all returns everything (excluding soft-deleted)", async () => {
    seedOffer({ title: "A" });
    seedOffer({ title: "B", archived: 1 });
    seedOffer({ title: "C", archivedAt: new Date().toISOString() });
    const app = buildApp();
    const res = await request(app).get("/api/offers?filter=all");
    expect(res.body).toHaveLength(2);
  });

  it("sort=company asc", async () => {
    seedOffer({ title: "Z", company: "Zeta" });
    seedOffer({ title: "A", company: "Alpha" });
    const app = buildApp();
    const res = await request(app).get("/api/offers?sort=company&order=asc");
    expect(res.body[0].company).toBe("Alpha");
    expect(res.body[1].company).toBe("Zeta");
  });

  it("sort=posted_at desc default", async () => {
    seedOffer({ title: "old", postedAt: "2026-01-01T00:00:00Z" });
    seedOffer({ title: "new", postedAt: "2026-06-01T00:00:00Z" });
    const app = buildApp();
    const res = await request(app).get("/api/offers");
    expect(res.body[0].title).toBe("new");
    expect(res.body[1].title).toBe("old");
  });

  it("rejects invalid sort", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/offers?sort=invalid");
    expect(res.status).toBe(400);
  });

  it("rejects invalid filter", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/offers?filter=bogus");
    expect(res.status).toBe(400);
  });

  it("has_message flag derived from chat_messages", async () => {
    const o = seedOffer();
    db().insert(schema.chatMessages).values({
      offerId: o.id,
      role: "assistant",
      content: "hi"
    }).run();
    const app = buildApp();
    const res = await request(app).get("/api/offers");
    expect(res.body[0].hasMessage).toBe(true);
  });
});

describe("GET /api/offers/:id", () => {
  it("returns full offer with messages", async () => {
    const o = seedOffer({ descriptionText: "full desc" });
    db().insert(schema.chatMessages).values({
      offerId: o.id,
      role: "assistant",
      content: "hello"
    }).run();
    const app = buildApp();
    const res = await request(app).get(`/api/offers/${o.id}`);
    expect(res.status).toBe(200);
    expect(res.body.descriptionText).toBe("full desc");
    expect(res.body.messages).toHaveLength(1);
  });

  it("404 for unknown id", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/offers/999");
    expect(res.status).toBe(404);
  });

  it("400 for non-numeric id", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/offers/abc");
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/offers/:id", () => {
  it("updates notes", async () => {
    const o = seedOffer();
    const app = buildApp();
    const res = await request(app).patch(`/api/offers/${o.id}`).send({ notes: "hello" });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("hello");
  });

  it("updates sent flag", async () => {
    const o = seedOffer();
    const app = buildApp();
    const res = await request(app).patch(`/api/offers/${o.id}`).send({ sent: true });
    expect(res.body.sent).toBe(true);
    expect(res.body.sentAt).toBeTruthy();
  });

  it("updates archived flag", async () => {
    const o = seedOffer();
    const app = buildApp();
    const res = await request(app).patch(`/api/offers/${o.id}`).send({ archived: true });
    expect(res.body.archived).toBe(true);
  });

  it("400 on empty body", async () => {
    const o = seedOffer();
    const app = buildApp();
    const res = await request(app).patch(`/api/offers/${o.id}`).send({});
    expect(res.status).toBe(400);
  });

  it("ignores unknown fields", async () => {
    const o = seedOffer();
    const app = buildApp();
    const res = await request(app).patch(`/api/offers/${o.id}`).send({ notes: "x", bogus: 1 });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("x");
  });

  it("404 for unknown id", async () => {
    const app = buildApp();
    const res = await request(app).patch("/api/offers/999").send({ notes: "x" });
    expect(res.status).toBe(404);
  });

  it("partial update keeps other fields", async () => {
    const o = seedOffer({ notes: "keep" });
    const app = buildApp();
    const res = await request(app).patch(`/api/offers/${o.id}`).send({ sent: true });
    expect(res.body.notes).toBe("keep");
  });
});

describe("DELETE /api/offers/:id", () => {
  it("soft deletes (sets archivedAt)", async () => {
    const o = seedOffer();
    const app = buildApp();
    const res = await request(app).delete(`/api/offers/${o.id}`);
    expect(res.status).toBe(204);
    const row = db().select().from(schema.offers).where(eq(schema.offers.id, o.id)).get();
    expect(row?.archivedAt).toBeTruthy();
  });

  it("subsequent GET /api/offers/:id returns 404", async () => {
    const o = seedOffer();
    const app = buildApp();
    await request(app).delete(`/api/offers/${o.id}`);
    const res = await request(app).get(`/api/offers/${o.id}`);
    expect(res.status).toBe(404);
  });

  it("archived (via PATCH) is NOT soft-deleted — still visible in filter=archived", async () => {
    const o = seedOffer();
    const app = buildApp();
    await request(app).patch(`/api/offers/${o.id}`).send({ archived: true });
    const res = await request(app).get("/api/offers?filter=archived");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(o.id);
  });

  it("404 for unknown id", async () => {
    const app = buildApp();
    const res = await request(app).delete("/api/offers/999");
    expect(res.status).toBe(404);
  });
});