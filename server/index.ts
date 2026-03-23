import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.ts";
import { serveStatic } from "./static.ts";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });

  const disableVite =
    process.env.DISABLE_VITE === "1" || process.env.DISABLE_VITE === "true";

  if (disableVite) {
    app.get("/", (_req, res) => {
      res.status(200).type("text/plain").send("Auditor XML SINTEGRA API running.");
    });
  } else if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const primaryHost = process.env.HOST || "0.0.0.0";
  const fallbackHost = "127.0.0.1";

  let didFallback = false;
  const startListening = (host: string) => {
    httpServer.listen({ port, host }, () => {
      log(`serving on http://${host}:${port}`);
    });
  };

  httpServer.on("error", (err: any) => {
    if (!didFallback && err?.code === "ENOTSUP" && primaryHost === "0.0.0.0") {
      didFallback = true;
      log(`listen failed on ${primaryHost}:${port}, retrying on ${fallbackHost}`);
      startListening(fallbackHost);
      return;
    }
    throw err;
  });

  startListening(primaryHost);
})();
