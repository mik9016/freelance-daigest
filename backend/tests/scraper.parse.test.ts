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

  it("collapses inline whitespace", () => {
    const html = `<article><div class="project-description"><p>  hello   world  </p></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("hello world");
  });

  it("preserves paragraph breaks", () => {
    const html = `<article><div class="project-description"><p>one</p><p>two</p></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("one\ntwo");
  });

  it("preserves div breaks", () => {
    const html = `<article><div class="project-description"><div>a</div><div>b</div></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("a\nb");
  });

  it("preserves list items", () => {
    const html = `<article><div class="project-description"><ul><li>x</li><li>y</li></ul></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("x\ny");
  });

  it("converts <br> to newline", () => {
    const html = `<article><div class="project-description"><p>foo<br>bar</p></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("foo\nbar");
  });

  it("collapses consecutive blank lines", () => {
    const html = `<article><div class="project-description"><p>a</p><p>b</p><p>c</p></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("a\nb\nc");
  });

  it("preserves table rows and separates cells with tab", () => {
    const html = `<article><div class="project-description"><table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("a\tb\nc\td");
  });

  it("flattens nested block to a single line", () => {
    const html = `<article><div class="project-description"><ul><li><p>x</p></li></ul></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("x");
  });

  it("collapses non-breaking spaces", () => {
    const html = `<article><div class="project-description"><p>a&nbsp;&nbsp;b</p></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).toBe("a b");
  });

  it("strips script tags from description", () => {
    const html = `<article><div class="project-description"><p>hello</p><script>alert(1)</script></div></article>`;
    const r = parseDetailPage(html);
    expect(r.descriptionText).not.toContain("alert(1)");
  });
});

describe("parseSearchPage description formatting", () => {
  it("preserves paragraph breaks in JSON description", () => {
    const html = `<html><script type="application/json" data-component-name="ProjectSearch">{"initialResults":[{"id":1,"slug":"x","title":"T","description":"<p>one</p><p>two</p>"}]}</script></html>`;
    const cards = parseSearchPage(html);
    expect(cards[0]!.descriptionText).toBe("one\ntwo");
  });

  it("preserves list items in JSON description", () => {
    const html = `<html><script type="application/json" data-component-name="ProjectSearch">{"initialResults":[{"id":1,"slug":"x","title":"T","description":"<ul><li>a</li><li>b</li><li>c</li></ul>"}]}</script></html>`;
    const cards = parseSearchPage(html);
    expect(cards[0]!.descriptionText).toBe("a\nb\nc");
  });

  it("detail page fixture preserves paragraph break", () => {
    const { descriptionText } = parseDetailPage(detailHtml);
    expect(descriptionText).toContain(
      "Wir suchen einen erfahrenen React Entwickler für den Ausbau unserer SaaS-Plattform.\nAnforderungen: React 19, TypeScript, Vite."
    );
  });
});