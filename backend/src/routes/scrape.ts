import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getScrapeProgress, triggerScrape } from "../jobs/cron.js";

export const scrapeRouter = Router();

scrapeRouter.use(authMiddleware);

scrapeRouter.post("/run", (_req: Request, res: Response) => {
  const result = triggerScrape();
  if (result.started) {
    res.status(202).json({ status: "started" });
  } else {
    res.status(409).json({ error: result.reason ?? "scrape_in_progress" });
  }
});

scrapeRouter.get("/status", (_req, res) => {
  res.json(getScrapeProgress());
});