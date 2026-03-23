import type { Express } from "express";
import { createServer, type Server } from "http";
import { getUploadCount, incrementUploadCount } from "./counter.ts";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/upload-stats", (_req, res) => {
    res.json({ count: getUploadCount() });
  });

  app.post("/api/upload-stats/increment", (_req, res) => {
    const newCount = incrementUploadCount();
    res.json({ count: newCount });
  });

  return httpServer;
}
