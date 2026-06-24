import { api } from "./client";

export interface Offer {
  id: number;
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
  searchTerms: string[];
  archived: boolean;
  sent: boolean;
  sentAt: string | null;
  notes: string;
  hasMessage: boolean;
  hasNotes: boolean;
  openwebuiChatId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: number;
  offerId: number;
  role: "user" | "assistant";
  content: string;
  openwebuiChatId: string | null;
  createdAt: string;
}

export type OfferFilter = "all" | "active" | "archived" | "sent" | "unsent";
export type SortField = "posted_at" | "company" | "has_message" | "has_notes" | "title" | "created_at";
export type SortOrder = "asc" | "desc";

export function listOffers(params: {
  filter?: OfferFilter;
  sort?: SortField;
  order?: SortOrder;
  limit?: number;
  offset?: number;
}): Promise<Offer[]> {
  const q = new URLSearchParams();
  if (params.filter) q.set("filter", params.filter);
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  return api.get<Offer[]>(`/offers?${q.toString()}`);
}

export function getOffer(id: number): Promise<{ messages: ChatMessage[] } & Offer> {
  return api.get(`/offers/${id}`);
}

export function patchOffer(id: number, body: Partial<{ notes: string; sent: boolean; archived: boolean }>): Promise<Offer> {
  return api.patch(`/offers/${id}`, body);
}

export function deleteOffer(id: number): Promise<void> {
  return api.del(`/offers/${id}`);
}

export function generateProposal(id: number): Promise<ChatMessage> {
  return api.post(`/offers/${id}/generate`);
}

export function listMessages(id: number): Promise<ChatMessage[]> {
  return api.get(`/offers/${id}/messages`);
}

export function sendMessage(id: number, content: string): Promise<{
  user: { id: number };
  assistant: { id: number; content: string; chatId: string };
}> {
  return api.post(`/offers/${id}/messages`, { content });
}

export function triggerScrape(): Promise<{ status: string }> {
  return api.post(`/scrape/run`);
}

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

export function getScrapeStatus(): Promise<ScrapeProgress> {
  return api.get(`/scrape/status`);
}