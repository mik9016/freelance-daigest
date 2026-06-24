import { describe, it, expect } from "vitest";
import { buildSearchUrl } from "../src/scraper/freelancermap.js";

describe("buildSearchUrl", () => {
  it("builds URL with encoded term", () => {
    const u = buildSearchUrl("fullstack", 1);
    expect(u).toContain("query=fullstack");
    expect(u).toContain("pagenr=1");
    expect(u).toContain("projectContractTypes%5B0%5D=contracting");
    expect(u).toContain("remoteInPercent%5B0%5D=100");
    expect(u).toContain("countries%5B%5D=1");
    expect(u).toContain("sort=2");
    expect(u).toContain("created=1");
  });

  it("encodes spaces and umlauts", () => {
    const u = buildSearchUrl("über dev", 2);
    expect(u).toMatch(/query=%C3%BCber[%2B+ ]dev/);
    expect(u).toContain("pagenr=2");
  });

  it("rejects non-positive page", () => {
    expect(() => buildSearchUrl("x", 0)).toThrow(RangeError);
    expect(() => buildSearchUrl("x", -1)).toThrow(RangeError);
  });

  it("rejects non-string term", () => {
    expect(() => buildSearchUrl(null as unknown as string, 1)).toThrow(TypeError);
  });
});