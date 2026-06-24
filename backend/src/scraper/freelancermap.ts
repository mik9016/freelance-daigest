import { and, eq } from "drizzle-orm";
import { config, searchTerms } from "../config.js";
import { db, schema } from "../db/client.js";
import type { OfferCard } from "./parse.js";
import { parseSearchPage } from "./parse.js";
import { mergeByExternalId, type MergedOffer, type TermOffers } from "./dedupe.js";
import { http } from "../lib/http.js";
import { logger } from "../lib/logger.js";

const BASE = "https://www.freelancermap.de";

export function buildSearchUrl(term: string, page: number): string {
  if (typeof term !== "string" || !term.trim()) {
    throw new TypeError("term must be a non-empty string");
  }
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError("page must be a positive integer");
  }
  const u = new URL(`${BASE}/projekte`);
  u.searchParams.set("created", "1");
  u.searchParams.set("projectContractTypes[0]", "contracting");
  u.searchParams.set("remoteInPercent[0]", "100");
  u.searchParams.set("query", term);
  u.searchParams.append("countries[]", "1");
  u.searchParams.set("sort", "2");
  u.searchParams.set("pagenr", String(page));
  return u.toString();
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSearchPage(term: string, page: number): Promise<string> {
  const url = buildSearchUrl(term, page);
  const res = await http().get(url, { responseType: "text" });
  return typeof res.data === "string" ? res.data : String(res.data);
}

export interface ScrapeSummary {
  fetched: number;
  persisted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

async function scrapeOneTerm(
  term: string,
  maxPages: number,
  delayMs: number
): Promise<{ cards: OfferCard[]; errors: string[] }> {
  const all: OfferCard[] = [];
  const errors: string[] = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const html = await fetchSearchPage(term, page);
      const cards = parseSearchPage(html);
      all.push(...cards);
      if (cards.length === 0) break;
      // No pagination detection beyond empty result for v1
      if (page < maxPages) await delay(delayMs);
    } catch (err) {
      logger.warn({ err, term, page }, "Search page fetch failed");
      errors.push(`search ${term} page ${page}: ${(err as Error).message}`);
      break;
    }
  }
  return { cards: all, errors };
}

export interface ScrapeProgressUpdate {
  currentTerm: string | null;
  pageIndex: number;
  maxPages: number;
  fetched: number;
  persisted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function runScrape(opts?: {
  terms?: string[];
  maxPages?: number;
  delayMs?: number;
  onProgress?: (p: ScrapeProgressUpdate) => void;
}): Promise<ScrapeSummary> {
  const terms = opts?.terms ?? searchTerms();
  const maxPages = opts?.maxPages ?? config().SCRAPER_MAX_PAGES;
  const delayMs = opts?.delayMs ?? config().SCRAPER_DELAY_MS;
  const onProgress = opts?.onProgress;
  const summary: ScrapeSummary = {
    fetched: 0,
    persisted: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };
  if (terms.length === 0) return summary;

  const startedAt = new Date().toISOString();
  const termBatches: TermOffers[] = [];
  for (const term of terms) {
    const { cards, errors } = await scrapeOneTerm(term, maxPages, delayMs);
    summary.fetched += cards.length;
    summary.errors.push(...errors);
    termBatches.push({ term, offers: cards });
    onProgress?.({
      currentTerm: term,
      pageIndex: maxPages,
      maxPages,
      fetched: summary.fetched,
      persisted: summary.persisted,
      updated: summary.updated,
      skipped: summary.skipped,
      errors: summary.errors
    });
    await delay(delayMs);
  }

  const merged = mergeByExternalId(termBatches);

  for (const offer of merged) {
    const existing = db()
      .select()
      .from(schema.offers)
      .where(eq(schema.offers.externalId, offer.externalId))
      .get();
    if (existing) {
      const existingTerms = JSON.parse(existing.searchTerms || "[]") as string[];
      const union = [...new Set([...existingTerms, ...offer.searchTerms])];
      const set: Record<string, unknown> = {
        title: offer.title,
        company: offer.company ?? existing.company,
        location: offer.location ?? existing.location,
        remotePct: offer.remotePct,
        contractType: offer.contractType ?? existing.contractType,
        duration: offer.duration ?? existing.duration,
        startDate: offer.startDate ?? existing.startDate,
        postedAt: offer.postedAt ?? existing.postedAt,
        searchTerms: JSON.stringify(union),
        updatedAt: new Date().toISOString()
      };
      if (offer.descriptionText) {
        set.descriptionText = offer.descriptionText;
        set.rawHtml = offer.rawHtml;
      }
      db()
        .update(schema.offers)
        .set(set)
        .where(eq(schema.offers.id, existing.id))
        .run();
      summary.updated++;
      onProgress?.({
        currentTerm: null,
        pageIndex: 0,
        maxPages,
        fetched: summary.fetched,
        persisted: summary.persisted,
        updated: summary.updated,
        skipped: summary.skipped,
        errors: summary.errors
      });
      continue;
    }
    if (!offer.descriptionText) {
      summary.skipped++;
      continue;
    }
    const inserted = db()
      .insert(schema.offers)
      .values({
        externalId: offer.externalId,
        title: offer.title,
        company: offer.company,
        location: offer.location,
        remotePct: offer.remotePct,
        contractType: offer.contractType,
        duration: offer.duration,
        startDate: offer.startDate,
        postedAt: offer.postedAt,
        detailUrl: offer.detailUrl,
        descriptionText: offer.descriptionText,
        rawHtml: offer.rawHtml,
        searchTerms: JSON.stringify(offer.searchTerms)
      })
      .returning()
      .get();
    summary.persisted++;
    onProgress?.({
      currentTerm: null,
      pageIndex: 0,
      maxPages,
      fetched: summary.fetched,
      persisted: summary.persisted,
      updated: summary.updated,
      skipped: summary.skipped,
      errors: summary.errors
    });
    if (config().AUTO_GENERATE_ON_SCRAPE) {
      try {
        const { generateProposal } = await import("../openwebui/client.js");
        await generateProposal(inserted.id);
      } catch (err) {
        logger.warn({ err, offerId: inserted.id }, "Auto-generate proposal failed");
      }
    }
    await delay(delayMs);
  }

  // Record scrape run for observability
  for (const term of terms) {
    db()
      .insert(schema.scrapeRuns)
      .values({
        searchTerm: term,
        startedAt,
        finishedAt: new Date().toISOString(),
        newCount: summary.persisted,
        totalCount: summary.fetched,
        error: summary.errors.length > 0 ? summary.errors.join("; ") : null
      })
      .run();
  }
  return summary;
}