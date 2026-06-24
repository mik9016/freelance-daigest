import * as cheerio from "cheerio";

const BASE_URL = "https://www.freelancermap.de";

export interface OfferCard {
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
  rawHtml: string;
}

export interface ParsedDetail {
  descriptionText: string;
  rawHtml: string;
}

interface FmLocation {
  name?: string;
}

interface FmProjectItem {
  id?: number;
  slug?: string;
  title?: string;
  company?: string | null;
  city?: string | null;
  locations?: FmLocation[];
  contractType?: string | null;
  duration?: number | null;
  durationText?: string | null;
  beginningText?: string | null;
  beginningMonth?: number | null;
  beginningYear?: number | null;
  created?: string | null;
  description?: string | null;
}

interface FmProjectSearchPayload {
  initialResults?: FmProjectItem[];
}

const CONTRACT_TYPE_MAP: Record<string, string> = {
  CONTRACT: "Contracting",
  FREELANCER: "Freelance",
  PERMANENT: "Festanstellung",
  CONTRACTING: "Contracting"
};

const BLOCK_TAGS = [
  "address", "article", "aside", "blockquote", "dd", "div", "dl", "dt",
  "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section",
  "table", "tr", "ul"
];

function normalizeMultiline(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[^\S\n\t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

function withBlockBreaks($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>): void {
  root.find("br").replaceWith("\n");
  root.find(BLOCK_TAGS.join(",")).each((_i, el) => {
    const $el = $(el);
    $el.prepend("\n");
    $el.append("\n");
  });
  root.find("td, th").each((_i, el) => {
    $(el).append("\t");
  });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractProjectSearchJson(html: string): FmProjectSearchPayload | null {
  if (!html) return null;
  const m = html.match(
    /<script[^>]*data-component-name="ProjectSearch"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!m || !m[1]) return null;
  try {
    const parsed = JSON.parse(m[1]) as FmProjectSearchPayload;
    return parsed && Array.isArray(parsed.initialResults) ? parsed : null;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  withBlockBreaks($, $.root());
  const text = $("body").text() ?? $.html();
  return normalizeMultiline(text);
}

function buildStartDate(item: FmProjectItem): string | null {
  if (item.beginningText) {
    const t = item.beginningText.trim();
    if (/^(sofort|ab sofort|asap)$/i.test(t)) return null;
    const dm = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dm) {
      return `${dm[3]}-${dm[2]!.padStart(2, "0")}-${dm[1]!.padStart(2, "0")}`;
    }
    const my = t.match(/^(\d{1,2})\/(\d{4})$/);
    if (my) {
      return `${my[2]}-${my[1]!.padStart(2, "0")}-01`;
    }
  }
  if (item.beginningMonth && item.beginningYear) {
    return `${item.beginningYear}-${String(item.beginningMonth).padStart(2, "0")}-01`;
  }
  return null;
}

function buildDuration(item: FmProjectItem): string | null {
  if (item.durationText) return item.durationText;
  if (typeof item.duration === "number" && item.duration > 0) {
    return `${item.duration} Monate`;
  }
  return null;
}

function buildLocation(item: FmProjectItem): string | null {
  if (item.city && item.city.trim()) return item.city.trim();
  const locs = (item.locations ?? []).map((l) => l?.name).filter(Boolean) as string[];
  return locs.length ? locs[0]! : null;
}

function detectRemotePct(item: FmProjectItem, descText: string): number {
  const haystack = `${item.title ?? ""} ${descText}`.toLowerCase();
  if (/100\s*%\s*remote|fully remote|100% remote/.test(haystack)) return 100;
  const m = haystack.match(/(\d{1,3})\s*%\s*remote/);
  if (m) {
    const n = parseInt(m[1]!, 10);
    if (n >= 0 && n <= 100) return n;
  }
  if (/teilremote|hybrid/.test(haystack)) return 50;
  return 0;
}

export function parseSearchPage(html: string, _now: Date = new Date()): OfferCard[] {
  const payload = extractProjectSearchJson(html);
  if (!payload) return [];
  const cards: OfferCard[] = [];
  for (const item of payload.initialResults ?? []) {
    if (!item || !item.id || !item.slug || !item.title) continue;
    const rawHtml = item.description ?? "";
    const descriptionText = stripHtml(rawHtml);
    const slug = item.slug;
    cards.push({
      externalId: `fm-${item.id}`,
      title: decodeEntities(item.title.trim()),
      company: item.company?.trim() || null,
      location: buildLocation(item),
      remotePct: detectRemotePct(item, descriptionText),
      contractType: item.contractType
        ? CONTRACT_TYPE_MAP[item.contractType] ?? item.contractType
        : null,
      duration: buildDuration(item),
      startDate: buildStartDate(item),
      postedAt: item.created ?? null,
      detailUrl: `${BASE_URL}/projekt/${slug}`,
      descriptionText,
      rawHtml
    });
  }
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.externalId)) return false;
    seen.add(c.externalId);
    return true;
  });
}

export function parseDetailPage(html: string | null | undefined): ParsedDetail {
  if (!html) return { descriptionText: "", rawHtml: "" };
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const descriptionSel = [
    ".project-description",
    "[itemprop='description']",
    "article .description",
    ".description",
    "article"
  ];
  let descHtml = "";
  let descText = "";
  for (const sel of descriptionSel) {
    const $candidate = $(sel).first();
    if ($candidate.length) {
      descHtml = $candidate.html() ?? "";
      withBlockBreaks($, $candidate);
      descText = normalizeMultiline($candidate.text());
      if (descText) break;
    }
  }
  if (!descText) return { descriptionText: "", rawHtml: "" };
  return { descriptionText: descText, rawHtml: descHtml };
}