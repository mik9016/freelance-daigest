import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, desc, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";

export const offersRouter = Router();

const SORT_FIELDS = ["posted_at", "company", "has_message", "has_notes", "title", "created_at"] as const;
type SortField = (typeof SORT_FIELDS)[number];

const LIST_QUERY = z.object({
  filter: z.enum(["all", "active", "archived", "sent", "unsent"]).default("active"),
  sort: z.enum(SORT_FIELDS).default("posted_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().nonnegative().default(0)
});

interface OfferRow {
  id: number;
  externalId: string;
  title: string;
  company: string | null;
  location: string | null;
  remotePct: number;
  contractType: string | null;
  duration: string | null;
  startDate: string | null;
  postedAt: string | null;
  detailUrl: string;
  descriptionText: string;
  searchTerms: string[];
  archived: boolean;
  sent: boolean;
  sentAt: string | null;
  notes: string;
  hasMessage: boolean;
  hasNotes: boolean;
  openwebuiChatId: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRow(o: typeof schema.offers.$inferSelect, hasMessage: boolean): OfferRow {
  return {
    id: o.id,
    externalId: o.externalId,
    title: o.title,
    company: o.company,
    location: o.location,
    remotePct: o.remotePct,
    contractType: o.contractType,
    duration: o.duration,
    startDate: o.startDate,
    postedAt: o.postedAt,
    detailUrl: o.detailUrl,
    descriptionText: o.descriptionText,
    searchTerms: JSON.parse(o.searchTerms || "[]") as string[],
    archived: Boolean(o.archived),
    sent: Boolean(o.sent),
    sentAt: o.sentAt,
    notes: o.notes,
    hasMessage,
    hasNotes: Boolean(o.notes && o.notes.trim().length > 0),
    openwebuiChatId: o.openwebuiChatId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt
  };
}

offersRouter.use(authMiddleware);

offersRouter.get("/", (req: Request, res: Response) => {
  const parsed = LIST_QUERY.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error" });
    return;
  }
  const { filter, sort, order, limit, offset } = parsed.data;

  const conditions = [isNull(schema.offers.archivedAt)];
  if (filter === "active") {
    conditions.push(eq(schema.offers.archived, 0));
  } else if (filter === "archived") {
    conditions.push(eq(schema.offers.archived, 1));
  } else if (filter === "sent") {
    conditions.push(eq(schema.offers.archived, 0), eq(schema.offers.sent, 1));
  } else if (filter === "unsent") {
    conditions.push(eq(schema.offers.archived, 0), eq(schema.offers.sent, 0));
  }

  const baseOrderBy =
    sort === "company"
      ? order === "asc" ? asc(schema.offers.company) : desc(schema.offers.company)
      : sort === "title"
        ? order === "asc" ? asc(schema.offers.title) : desc(schema.offers.title)
        : sort === "created_at"
          ? order === "asc" ? asc(schema.offers.createdAt) : desc(schema.offers.createdAt)
          : order === "asc" ? asc(schema.offers.postedAt) : desc(schema.offers.postedAt);

  const rows = db()
    .select({
      o: schema.offers,
      hasMsg: sql<boolean>`EXISTS (SELECT 1 FROM chat_messages WHERE offer_id = ${schema.offers.id})`
    })
    .from(schema.offers)
    .where(and(...conditions))
    .orderBy(baseOrderBy)
    .limit(limit)
    .offset(offset)
    .all();

  let withFlags = rows.map(({ o, hasMsg }) => toRow(o, Boolean(hasMsg)));

  // has_message / has_notes sort: do in-memory after fetching (no index)
  if (sort === "has_message") {
    withFlags.sort((a, b) => Number(b.hasMessage) - Number(a.hasMessage));
    if (order === "asc") withFlags.reverse();
  } else if (sort === "has_notes") {
    withFlags.sort((a, b) => Number(b.hasNotes) - Number(a.hasNotes));
    if (order === "asc") withFlags.reverse();
  }

  res.json(withFlags);
});

offersRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const offer = db()
    .select()
    .from(schema.offers)
    .where(eq(schema.offers.id, id))
    .get();
  if (!offer || offer.archivedAt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const messages = db()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.offerId, id))
    .orderBy(asc(schema.chatMessages.createdAt))
    .all();
  res.json({ ...toRow(offer, messages.length > 0), messages });
});

const PATCH_BODY = z.object({
  notes: z.string().max(50000).optional(),
  sent: z.boolean().optional(),
  archived: z.boolean().optional()
}).refine((b) => Object.keys(b).length > 0, { message: "empty_body" });

offersRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = PATCH_BODY.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error" });
    return;
  }
  const offer = db()
    .select()
    .from(schema.offers)
    .where(eq(schema.offers.id, id))
    .get();
  if (!offer || offer.archivedAt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  if (parsed.data.sent !== undefined) {
    patch.sent = parsed.data.sent ? 1 : 0;
    patch.sentAt = parsed.data.sent ? new Date().toISOString() : null;
  }
  if (parsed.data.archived !== undefined) {
    patch.archived = parsed.data.archived ? 1 : 0;
  }
  db().update(schema.offers).set(patch).where(eq(schema.offers.id, id)).run();
  const updated = db().select().from(schema.offers).where(eq(schema.offers.id, id)).get();
  const hasMessage =
    db()
      .select({ id: schema.chatMessages.id })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.offerId, id))
      .get() != null;
  res.json(toRow(updated!, hasMessage));
});

offersRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const offer = db()
    .select()
    .from(schema.offers)
    .where(eq(schema.offers.id, id))
    .get();
  if (!offer) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!offer.archivedAt) {
    db()
      .update(schema.offers)
      .set({
        archived: 1,
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(schema.offers.id, id))
      .run();
  }
  res.status(204).end();
});