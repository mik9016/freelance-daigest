import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const offers = sqliteTable(
  "offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalId: text("external_id").notNull().unique(),
    title: text("title").notNull(),
    company: text("company"),
    location: text("location"),
    remotePct: integer("remote_pct").notNull().default(0),
    contractType: text("contract_type"),
    duration: text("duration"),
    startDate: text("start_date"),
    postedAt: text("posted_at"),
    detailUrl: text("detail_url").notNull(),
    descriptionText: text("description_text").notNull().default(""),
    rawHtml: text("raw_html").notNull().default(""),
    searchTerms: text("search_terms").notNull().default("[]"),
    archived: integer("archived").notNull().default(0),
    archivedAt: text("archived_at"),
    sent: integer("sent").notNull().default(0),
    sentAt: text("sent_at"),
    notes: text("notes").notNull().default(""),
    openwebuiChatId: text("openwebui_chat_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (t) => ({
    archivedIdx: index("offers_archived_idx").on(t.archived),
    sentIdx: index("offers_sent_idx").on(t.sent),
    archivedAtIdx: index("offers_archived_at_idx").on(t.archivedAt),
    postedAtIdx: index("offers_posted_at_idx").on(t.postedAt),
    companyIdx: index("offers_company_idx").on(t.company)
  })
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    offerId: integer("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    openwebuiChatId: text("openwebui_chat_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (t) => ({
    offerIdIdx: index("chat_messages_offer_id_idx").on(t.offerId),
    createdAtIdx: index("chat_messages_created_at_idx").on(t.createdAt)
  })
);

export const scrapeRuns = sqliteTable("scrape_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  searchTerm: text("search_term").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  newCount: integer("new_count").notNull().default(0),
  totalCount: integer("total_count").notNull().default(0),
  error: text("error")
});

export const cvs = sqliteTable("cvs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  contentText: text("content_text").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  sizeBytes: integer("size_bytes").notNull(),
  isActive: integer("is_active").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export type Offer = typeof offers.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;
export type Cv = typeof cvs.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type NewCv = typeof cvs.$inferInsert;