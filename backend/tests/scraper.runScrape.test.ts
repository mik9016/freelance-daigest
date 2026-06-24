import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { db, initDb, schema, closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { setHttpClientForTest } from "../src/lib/http.js";
import { runScrape } from "../src/scraper/freelancermap.js";

function buildSearchHtml(items: Array<{
  id: number;
  slug: string;
  title: string;
  company?: string | null;
  city?: string | null;
  locations?: Array<{ name: string }>;
  contractType?: string | null;
  duration?: number | null;
  beginningText?: string | null;
  beginningMonth?: number | string | null;
  beginningYear?: number | string | null;
  created?: string;
  description?: string;
}>): string {
  const payload = { initialResults: items };
  return (
    '<!doctype html><html><body>' +
    '<script type="application/json" class="js-react-on-rails-component" ' +
    'data-component-name="ProjectSearch" data-dom-id="x">' +
    JSON.stringify(payload) +
    '</script></body></html>'
  );
}

const DEFAULT_ITEMS = [
  {
    id: 111,
    slug: "offer-aaa-111",
    title: "Senior React Dev",
    company: "Acme GmbH",
    city: "Berlin",
    locations: [{ name: "Berlin" }],
    contractType: "CONTRACT",
    duration: 6,
    beginningText: "asap",
    created: "2026-06-20T10:00:00+02:00",
    description: '<div class="ql-editor"><p>Wir suchen einen React Entwickler. React 19, TypeScript.</p></div>'
  }
];

interface GetCall {
  url: string;
  ts: number;
}

function mockHttp(opts: { searchHtml?: string } = {}): { get: ReturnType<typeof vi.fn>; calls: GetCall[] } {
  const calls: GetCall[] = [];
  const searchHtml = opts.searchHtml ?? buildSearchHtml(DEFAULT_ITEMS);
  const get = vi.fn().mockImplementation(async (url: string) => {
    calls.push({ url, ts: Date.now() });
    const data = url.includes("/projekte") ? searchHtml : "";
    return { data, status: 200, statusText: "OK", headers: {}, config: {} };
  });
  const instance = {
    get,
    post: vi.fn(),
    put: vi.fn(),
    defaults: { headers: { common: {} } },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
  } as unknown as AxiosInstance;
  setHttpClientForTest(instance);
  return { get, calls };
}

beforeEach(() => {
  closeDb();
  initDb(":memory:");
  runMigrations();
});

afterEach(() => {
  closeDb();
});

describe("runScrape", () => {
  it("inserts a scrape_runs row per search term with counts and timestamps", async () => {
    mockHttp();
    const summary = await runScrape({
      terms: ["react"],
      maxPages: 1,
      delayMs: 0
    });
    expect(summary.fetched).toBe(1);
    expect(summary.persisted).toBe(1);

    const rows = db().select().from(schema.scrapeRuns).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.searchTerm).toBe("react");
    expect(rows[0]!.startedAt).toBeTruthy();
    expect(rows[0]!.finishedAt).toBeTruthy();
    expect(rows[0]!.newCount).toBe(1);
    expect(rows[0]!.totalCount).toBe(1);
    expect(rows[0]!.error).toBeNull();
  });

  it("records errors in the scrape_runs.error column when a search page fetch fails", async () => {
    const get = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/projekte")) {
        throw new Error("network down");
      }
      return { data: "", status: 200 };
    });
    const instance = {
      get,
      post: vi.fn(),
      put: vi.fn(),
      defaults: { headers: { common: {} } },
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
    } as unknown as AxiosInstance;
    setHttpClientForTest(instance);

    const summary = await runScrape({
      terms: ["react"],
      maxPages: 1,
      delayMs: 0
    });
    expect(summary.fetched).toBe(0);
    expect(summary.errors.length).toBeGreaterThan(0);

    const rows = db().select().from(schema.scrapeRuns).all();
    expect(rows[0]!.error).toContain("network down");
  });

  it("upserts existing offer instead of inserting a duplicate", async () => {
    mockHttp();
    await runScrape({ terms: ["react"], maxPages: 1, delayMs: 0 });
    const summary2 = await runScrape({ terms: ["react"], maxPages: 1, delayMs: 0 });
    expect(summary2.persisted).toBe(0);
    expect(summary2.updated).toBe(1);

    const offers = db().select().from(schema.offers).all();
    expect(offers).toHaveLength(1);
    const terms = JSON.parse(offers[0]!.searchTerms) as string[];
    expect(terms).toEqual(["react"]);
  });

  it("respects delayMs between persisted offers", async () => {
    const items = [
      {
        id: 111,
        slug: "offer-aaa-111",
        title: "Senior React Dev",
        company: "Acme GmbH",
        contractType: "CONTRACT",
        duration: 6,
        beginningText: "asap",
        created: "2026-06-20T10:00:00+02:00",
        description: "<p>Desc one</p>"
      },
      {
        id: 222,
        slug: "offer-bbb-222",
        title: "Senior Vue Dev",
        company: "Beta GmbH",
        contractType: "CONTRACT",
        duration: 3,
        beginningText: "asap",
        created: "2026-06-21T10:00:00+02:00",
        description: "<p>Desc two</p>"
      }
    ];
    const calls: GetCall[] = [];
    const get = vi.fn().mockImplementation(async (url: string) => {
      calls.push({ url, ts: Date.now() });
      const data = url.includes("/projekte") ? buildSearchHtml(items) : "";
      return { data, status: 200 };
    });
    const instance = {
      get,
      post: vi.fn(),
      put: vi.fn(),
      defaults: { headers: { common: {} } },
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
    } as unknown as AxiosInstance;
    setHttpClientForTest(instance);

    const delayMs = 40;
    await runScrape({ terms: ["react"], maxPages: 1, delayMs });

    const searchCalls = calls.filter((c) => c.url.includes("/projekte"));
    expect(searchCalls.length).toBe(1);
    const offers = db().select().from(schema.offers).all();
    expect(offers).toHaveLength(2);
  });

  it("returns empty summary when terms list is empty", async () => {
    mockHttp();
    const summary = await runScrape({ terms: [], maxPages: 1, delayMs: 0 });
    expect(summary.fetched).toBe(0);
    expect(summary.persisted).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.skipped).toBe(0);
    const rows = db().select().from(schema.scrapeRuns).all();
    expect(rows).toHaveLength(0);
  });

  it("skips offers with no description in search results", async () => {
    const items = [
      {
        id: 333,
        slug: "offer-empty-desc",
        title: "Empty Desc Offer",
        company: "Gamma GmbH",
        contractType: "CONTRACT",
        duration: 6,
        beginningText: "asap",
        created: "2026-06-22T10:00:00+02:00",
        description: ""
      }
    ];
    mockHttp({ searchHtml: buildSearchHtml(items) });

    const summary = await runScrape({ terms: ["react"], maxPages: 1, delayMs: 0 });
    expect(summary.persisted).toBe(0);
    expect(summary.skipped).toBe(1);
    const rows = db().select().from(schema.scrapeRuns).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.newCount).toBe(0);
  });

  it("writes multiple scrape_runs rows when multiple terms are scraped", async () => {
    mockHttp();
    await runScrape({ terms: ["react", "vue"], maxPages: 1, delayMs: 0 });
    const rows = db().select().from(schema.scrapeRuns).all();
    expect(rows).toHaveLength(2);
    const terms = rows.map((r) => r.searchTerm).sort();
    expect(terms).toEqual(["react", "vue"]);
  });

  it("stores descriptionText and rawHtml on inserted offers", async () => {
    mockHttp();
    await runScrape({ terms: ["react"], maxPages: 1, delayMs: 0 });
    const offer = db().select().from(schema.offers).all()[0]!;
    expect(offer.descriptionText).toContain("Wir suchen einen React Entwickler");
    expect(offer.rawHtml).toContain("<p>");
  });

  it("updates descriptionText on upsert when new scrape has description", async () => {
    mockHttp();
    await runScrape({ terms: ["react"], maxPages: 1, delayMs: 0 });
    const before = db().select().from(schema.offers).all()[0]!;
    expect(before.descriptionText).toContain("Wir suchen einen React Entwickler");

    const items = [
      {
        ...DEFAULT_ITEMS[0]!,
        description: "<p>Updated description with new details.</p>"
      }
    ];
    mockHttp({ searchHtml: buildSearchHtml(items) });
    await runScrape({ terms: ["react"], maxPages: 1, delayMs: 0 });
    const after = db().select().from(schema.offers).all()[0]!;
    expect(after.descriptionText).toContain("Updated description");
  });
});