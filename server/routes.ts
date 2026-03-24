import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { recordVisit, ping, getStats } from "./counter.ts";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register a new visit (called on first page load)
  app.post("/api/visit", (req, res) => {
    recordVisit(req as unknown as Parameters<typeof recordVisit>[0]);
    res.json(getStats());
  });

  // Heartbeat — keeps user marked as online (called every 30s)
  app.post("/api/ping", (req, res) => {
    ping(req as unknown as Parameters<typeof ping>[0]);
    res.json(getStats());
  });

  // Get current stats
  app.get("/api/stats", (_req, res) => {
    res.json(getStats());
  });

  return httpServer;
}
