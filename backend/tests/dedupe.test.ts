import { describe, it, expect } from "vitest";
import { mergeByExternalId } from "../src/scraper/dedupe.js";
import type { OfferCard } from "../src/scraper/parse.js";

function card(id: string, title = id): OfferCard {
  return {
    externalId: id,
    title,
    company: null,
    location: null,
    remotePct: 100,
    contractType: null,
    duration: null,
    startDate: null,
    postedAt: null,
    detailUrl: `https://www.freelancermap.de/projekt/${id}`,
    descriptionText: "",
    rawHtml: ""
  };
}

describe("mergeByExternalId", () => {
  it("first occurrence wins for shared external_id", () => {
    const r = mergeByExternalId([
      { term: "react", offers: [card("1", "from-react")] },
      { term: "vue", offers: [card("1", "from-vue")] }
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe("from-react");
  });

  it("records all search_terms that found an offer", () => {
    const r = mergeByExternalId([
      { term: "react", offers: [card("1")] },
      { term: "typescript", offers: [card("1")] }
    ]);
    expect(r[0]!.searchTerms).toEqual(["react", "typescript"]);
  });

  it("preserves distinct offers across terms", () => {
    const r = mergeByExternalId([
      { term: "a", offers: [card("1"), card("2")] },
      { term: "b", offers: [card("3")] }
    ]);
    expect(r).toHaveLength(3);
  });

  it("returns empty for empty input", () => {
    expect(mergeByExternalId([])).toEqual([]);
  });

  it("handles term with empty offers list", () => {
    const r = mergeByExternalId([{ term: "x", offers: [] }]);
    expect(r).toEqual([]);
  });

  it("dedupes within a single term too", () => {
    const r = mergeByExternalId([
      { term: "react", offers: [card("1"), card("1", "second")] }
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.searchTerms).toEqual(["react"]);
  });

  it("does not mutate input arrays", () => {
    const a = [card("1")];
    const b = [card("1")];
    const inA = [...a];
    const inB = [...b];
    mergeByExternalId([{ term: "a", offers: a }, { term: "b", offers: b }]);
    expect(a).toEqual(inA);
    expect(b).toEqual(inB);
  });
});