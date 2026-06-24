import type { OfferCard } from "./parse.js";

export interface TermOffers {
  term: string;
  offers: OfferCard[];
}

export interface MergedOffer extends OfferCard {
  searchTerms: string[];
}

/**
 * Merge offers from multiple search terms, deduplicating by external_id.
 * First occurrence wins for card fields; search_terms records every term that found it.
 */
export function mergeByExternalId(inputs: TermOffers[]): MergedOffer[] {
  const map = new Map<string, MergedOffer>();
  const order: string[] = [];
  for (const { term, offers } of inputs) {
    for (const card of offers) {
      const existing = map.get(card.externalId);
      if (existing) {
        if (!existing.searchTerms.includes(term)) {
          existing.searchTerms.push(term);
        }
      } else {
        map.set(card.externalId, { ...card, searchTerms: [term] });
        order.push(card.externalId);
      }
    }
  }
  return order.map((id) => map.get(id)!);
}