import cron, { type ScheduledTask } from "node-cron";
import { config } from "../config.js";
import { runScrape, type ScrapeSummary } from "../scraper/freelancermap.js";
import { logger } from "../lib/logger.js";

let scheduledTask: ScheduledTask | null = null;
let running = false;

export interface ScrapeProgress {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  terms: string[];
  currentTerm: string | null;
  pageIndex: number;
  maxPages: number;
  fetched: number;
  persisted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

let progress: ScrapeProgress = emptyProgress();

function emptyProgress(): ScrapeProgress {
  return {
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
  };
}

export function isScrapeRunning(): boolean {
  return running;
}

export function getScrapeProgress(): ScrapeProgress {
  return { ...progress };
}

export function triggerScrape(): { started: boolean; reason?: string } {
  if (running) return { started: false, reason: "scrape_in_progress" };
  running = true;
  const startedAt = new Date().toISOString();
  const terms = config().SEARCH_TERMS.split(",").map((s) => s.trim()).filter(Boolean);
  progress = {
    ...emptyProgress(),
    running: true,
    startedAt,
    terms,
    maxPages: config().SCRAPER_MAX_PAGES
  };
  setImmediate(async () => {
    try {
      const summary = await runScrape({
        onProgress: (p) => {
          progress.currentTerm = p.currentTerm;
          progress.pageIndex = p.pageIndex;
          progress.maxPages = p.maxPages;
          progress.fetched = p.fetched;
          progress.persisted = p.persisted;
          progress.updated = p.updated;
          progress.skipped = p.skipped;
          progress.errors = p.errors;
        }
      });
      progress.persisted = summary.persisted;
      progress.updated = summary.updated;
      progress.skipped = summary.skipped;
      progress.fetched = summary.fetched;
      progress.errors = summary.errors;
      logger.info(summary, "Scrape complete");
    } catch (err) {
      logger.error({ err }, "Scrape failed");
      progress.errors.push(`scrape_failed: ${(err as Error).message}`);
    } finally {
      running = false;
      progress.running = false;
      progress.finishedAt = new Date().toISOString();
      progress.currentTerm = null;
    }
  });
  return { started: true };
}

export function startCron(): ScheduledTask {
  const schedule = config().CRON_SCHEDULE;
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid CRON_SCHEDULE: ${schedule}`);
  }
  scheduledTask = cron.schedule(schedule, async () => {
    if (running) {
      logger.warn("Cron tick skipped: scrape in progress");
      return;
    }
    triggerScrape();
  });
  logger.info({ schedule }, "Cron scheduled");
  return scheduledTask;
}

export function stopCron(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}