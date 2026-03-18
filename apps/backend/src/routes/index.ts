import type { Express, Request, Response } from "express";
import { prisma } from "@repo/db";

export const registerRoutes = (app: Express): void => {
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, service: "backend" });
  });

  app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      app: "backend",
      message: "Hello from backend",
    });
  });

  app.post("/api/hello-record", async (req: Request, res: Response) => {
    try {
      const inputMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      const message = inputMessage || `HelloRecord created at ${new Date().toISOString()}`;

      const createdRecord = await prisma.helloRecord.create({
        data: { message },
      });

      res.status(201).json({
        ok: true,
        record: createdRecord,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ ok: false, error: errorMessage });
    }
  });
};
