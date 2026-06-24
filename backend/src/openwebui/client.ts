import axios, { type AxiosInstance } from "axios";
import { asc, eq } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { renderSystemPrompt } from "./prompts.js";

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionsRequest {
  model?: string;
  messages: ChatMessage[];
  chatId?: string;
  temperature?: number;
}

export interface ChatCompletionsResponse {
  content: string;
  chatId: string;
}

type OpenWebUIErrorCode = "auth" | "client" | "server" | "timeout" | "parse" | "network";

class OpenWebUIError extends Error {
  constructor(
    message: string,
    public readonly code: OpenWebUIErrorCode,
    public readonly status?: number
  ) {
    super(message);
    this.name = "OpenWebUIError";
  }
}

export { OpenWebUIError };

let axiosInstance: AxiosInstance | null = null;

function client(): AxiosInstance {
  if (axiosInstance) return axiosInstance;
  const cfg = config();
  axiosInstance = axios.create({
    baseURL: cfg.OPENWEBUI_BASE_URL,
    timeout: cfg.OPENWEBUI_REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${cfg.OPENWEBUI_API_KEY}`,
      "Content-Type": "application/json"
    },
    validateStatus: () => true
  });
  return axiosInstance;
}

export function setClientForTest(instance: AxiosInstance): void {
  axiosInstance = instance;
}

export async function chatCompletions(
  req: ChatCompletionsRequest
): Promise<ChatCompletionsResponse> {
  const cfg = config();
  const body = {
    model: req.model ?? cfg.OPENWEBUI_MODEL,
    messages: req.messages,
    stream: false,
    // OpenWebUI v0.9.5 crashes with "'NoneType' object has no attribute 'startswith'"
    // when external callers omit both chat_id and parent_id. Send parent_id: null
    // for new chats, chat_id for existing threads.
    ...(req.chatId ? { chat_id: req.chatId } : { parent_id: null }),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {})
  };
  let res;
  try {
    res = await client().post("/api/chat/completions", body);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ETIMEDOUT") {
      throw new OpenWebUIError("OpenWebUI request timed out", "timeout");
    }
    if (code === "ECONNREFUSED") {
      throw new OpenWebUIError("OpenWebUI unreachable", "network", undefined);
    }
    throw new OpenWebUIError(
      `OpenWebUI network error: ${(err as Error).message}`,
      "network",
      undefined
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new OpenWebUIError("OpenWebUI rejected API key", "auth", res.status);
  }
  if (res.status >= 400 && res.status < 500) {
    throw new OpenWebUIError(`OpenWebUI client error ${res.status}`, "client", res.status);
  }
  if (res.status >= 500) {
    throw new OpenWebUIError(`OpenWebUI server error ${res.status}`, "server", res.status);
  }
  const data = res.data;
  const content: string =
    data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content ?? "";
  const chatId: string | undefined =
    req.chatId ?? data?.chat_id ?? data?.id ?? data?.choices?.[0]?.chat_id;
  if (!chatId) {
    throw new OpenWebUIError("OpenWebUI response missing chat_id", "parse");
  }
  return { content: content.trim(), chatId };
}

export async function generateProposal(offerId: number): Promise<{
  content: string;
  chatId: string;
  userMessageId: number;
  assistantMessageId: number;
}> {
  const offer = db()
    .select()
    .from(schema.offers)
    .where(eq(schema.offers.id, offerId))
    .get();
  if (!offer) throw new OpenWebUIError(`Offer ${offerId} not found`, "parse");
  if (!offer.descriptionText) {
    throw new OpenWebUIError(`Offer ${offerId} has empty description`, "parse");
  }
  const existing = db()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.offerId, offerId))
    .get();
  if (existing) {
    throw new OpenWebUIError("Proposal already exists for offer", "server", 409);
  }
  const system = renderSystemPrompt(loadCv());
  const userContent = buildOfferPrompt(offer);
  const result = await chatCompletions({
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent }
    ]
  });
  const userRow = db()
    .insert(schema.chatMessages)
    .values({
      offerId,
      role: "user",
      content: userContent,
      openwebuiChatId: result.chatId
    })
    .returning()
    .get();
  const assistantRow = db()
    .insert(schema.chatMessages)
    .values({
      offerId,
      role: "assistant",
      content: result.content,
      openwebuiChatId: result.chatId
    })
    .returning()
    .get();
  db()
    .update(schema.offers)
    .set({ openwebuiChatId: result.chatId, updatedAt: new Date().toISOString() })
    .where(eq(schema.offers.id, offerId))
    .run();
  return {
    content: result.content,
    chatId: result.chatId,
    userMessageId: userRow.id,
    assistantMessageId: assistantRow.id
  };
}

export async function sendUserMessage(
  offerId: number,
  content: string
): Promise<{ user: { id: number }; assistant: { id: number; content: string; chatId: string } }> {
  const offer = db()
    .select()
    .from(schema.offers)
    .where(eq(schema.offers.id, offerId))
    .get();
  if (!offer) throw new OpenWebUIError(`Offer ${offerId} not found`, "parse");
  const prior = db()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.offerId, offerId))
    .orderBy(asc(schema.chatMessages.createdAt), asc(schema.chatMessages.id))
    .all();
  if (prior.length === 0) {
    throw new OpenWebUIError("No thread; call /generate first", "server", 409);
  }
  const chatId = offer.openwebuiChatId ?? prior[0]?.openwebuiChatId;
  if (!chatId) {
    throw new OpenWebUIError("No chat_id on prior messages", "server", 409);
  }
  const userRow = db()
    .insert(schema.chatMessages)
    .values({
      offerId,
      role: "user",
      content,
      openwebuiChatId: chatId
    })
    .returning()
    .get();
  try {
    // OpenWebUI external API does not auto-load chat history server-side.
    // Send full conversation (system + prior turns + new user message) each call.
    const system = renderSystemPrompt(loadCv());
    const history: ChatMessage[] = prior.map((m) => ({
      role: m.role as ChatRole,
      content: m.content
    }));
    history.push({ role: "user", content });
    const result = await chatCompletions({
      chatId,
      messages: [{ role: "system", content: system }, ...history]
    });
    const assistantRow = db()
      .insert(schema.chatMessages)
      .values({
        offerId,
        role: "assistant",
        content: result.content,
        openwebuiChatId: result.chatId
      })
      .returning()
      .get();
    return {
      user: { id: userRow.id },
      assistant: { id: assistantRow.id, content: result.content, chatId: result.chatId }
    };
  } catch (err) {
    logger.error({ err, offerId }, "OpenWebUI chat failed; user message persisted");
    throw err;
  }
}

export function buildOfferPrompt(offer: {
  title: string;
  company: string | null;
  location: string | null;
  descriptionText: string;
  detailUrl: string;
}): string {
  return `Job offer details:

Title: ${offer.title}
Company: ${offer.company ?? "unknown"}
Location: ${offer.location ?? "remote"}
Detail URL: ${offer.detailUrl}

Description:
${offer.descriptionText}

---
Draft a German-language application message for this freelance role using the CV in the system prompt.`;
}

let cvCache: string | null = null;

export function loadCv(): string {
  if (cvCache !== null) return cvCache;
  const row = db()
    .select()
    .from(schema.cvs)
    .where(eq(schema.cvs.isActive, 1))
    .get();
  if (!row) {
    throw new OpenWebUIError(
      "No active CV uploaded — POST /api/cv to upload one",
      "server",
      500
    );
  }
  cvCache = row.contentText;
  return cvCache;
}

export function resetCvCacheForTest(): void {
  cvCache = null;
}

export function invalidateCvCache(): void {
  cvCache = null;
}