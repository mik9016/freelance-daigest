import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { generateProposal, sendUserMessage, OpenWebUIError } from "../openwebui/client.js";

export const messagesRouter = Router();

messagesRouter.use(authMiddleware);

const POST_BODY = z.object({
  content: z.string().min(1).max(20000)
});

messagesRouter.post("/:id/generate", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const offer = db().select().from(schema.offers).where(eq(schema.offers.id, id)).get();
  if (!offer || offer.archivedAt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!offer.descriptionText) {
    res.status(400).json({ error: "missing_description" });
    return;
  }
  const existing = db()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.offerId, id))
    .get();
  if (existing) {
    res.status(409).json({ error: "proposal_exists" });
    return;
  }
  try {
    const result = await generateProposal(id);
    res.status(201).json({
      id: result.assistantMessageId,
      role: "assistant",
      content: result.content,
      chatId: result.chatId,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    if (err instanceof OpenWebUIError) {
      const status =
        err.code === "auth" ? 502 :
        err.code === "timeout" ? 504 :
        err.code === "client" || err.code === "server" ? 502 : 500;
      logger.error({ err: err.message, code: err.code, status: err.status, offerId: id }, "OpenWebUI generate failed");
      res.status(status).json({ error: "ai_unavailable" });
      return;
    }
    throw err;
  }
});

messagesRouter.get("/:id/messages", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const offer = db().select().from(schema.offers).where(eq(schema.offers.id, id)).get();
  if (!offer || offer.archivedAt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const messages = db()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.offerId, id))
    .orderBy(schema.chatMessages.createdAt)
    .all();
  res.json(messages);
});

messagesRouter.post("/:id/messages", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = POST_BODY.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error" });
    return;
  }
  const offer = db().select().from(schema.offers).where(eq(schema.offers.id, id)).get();
  if (!offer || offer.archivedAt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const prior = db()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.offerId, id))
    .get();
  if (!prior) {
    res.status(409).json({ error: "no_thread" });
    return;
  }
  try {
    const result = await sendUserMessage(id, parsed.data.content);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof OpenWebUIError) {
      const status =
        err.code === "timeout" ? 504 :
        err.code === "auth" || err.code === "server" || err.code === "client" ? 502 : 500;
      res.status(status).json({ error: "ai_unavailable" });
      return;
    }
    throw err;
  }
});