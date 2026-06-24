import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSearchPage, parseDetailPage } from "../src/scraper/parse.js";

const searchHtml = readFileSync(join(__dirname, "fixtures/search-page.html"), "utf-8");
const detailHtml = readFileSync(join(__dirname, "fixtures/detail-page.html"), "utf-8");

describe("parseSearchPage", () => {
  it("extracts 3 cards from fixture", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards).toHaveLength(3);
  });

  it("builds external_id as fm-<id>", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[0]!.externalId).toBe("fm-2987405");
  });

  it("builds absolute detail_url from slug", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[0]!.detailUrl).toBe(
      "https://www.freelancermap.de/projekt/senior-frontend-architect"
    );
  });

  it("extracts title, company, location", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[0]!.title).toBe("Senior Frontend Architect");
    expect(cards[0]!.company).toBe("OPUS");
    expect(cards[0]!.location).toBe("Cologne");
  });

  it("detects 100% remote from description", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[0]!.remotePct).toBe(100);
  });

  it("maps contractType CONTRACT to Contracting", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[0]!.contractType).toBe("Contracting");
  });

  it("builds duration string from number", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[0]!.duration).toBe("3 Monate");
  });

  it("maps asap beginningText to null startDate", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[0]!.startDate).toBeNull();
  });

  it("builds startDate from beginningMonth/Year", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[1]!.startDate).toBe("2026-07-01");
  });

  it("uses ISO created timestamp as postedAt", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[0]!.postedAt).toBe("2026-04-08T09:39:18+02:00");
  });

  it("extracts description text and raw HTML from JSON description", () => {
    const cards = parseSearchPage(searchHtml);
    expect(cards[0]!.descriptionText.length).toBeGreaterThan(100);
    expect(cards[0]!.rawHtml).toContain("<div");
  });

  it("returns empty array for empty string", () => {
    expect(parseSearchPage("")).toEqual([]);
  });

  it("returns empty array for non-HTML without ProjectSearch JSON", () => {
    expect(parseSearchPage("not html at all")).toEqual([]);
  });
});

describe("parseDetailPage", () => {
  it("extracts description_text from .project-description", () => {
    const { descriptionText, rawHtml } = parseDetailPage(detailHtml);
    expect(descriptionText).toContain("Wir suchen einen erfahrenen React Entwickler");
    expect(descriptionText).toContain("Anforderungen: React 19, TypeScript, Vite.");
    expect(rawHtml).toContain("<p>");
  });

  it("returns empty for null input", () => {
    const r = parseDetailPage(null);
    expect(r).toEqual({ descriptionText: "", rawHtml: "" });
  });

  it("returns empty for empty string", () => {
    const r = parseDetailPage("");
    expect(r).toEqual({ descriptionText: "", rawHtml: "" });
  });

  it("collapses whitespace", () => {
    const html = `<article><div class="project-description"><p>  hello   world  </p></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("hello world");
  });

  it("strips script tags from description", () => {
    const html = `<article><div class="project-description"><p>hello</p><script>alert(1)</script></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).not.toContain("alert(1)");
  });
});