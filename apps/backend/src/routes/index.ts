import type { Express, Request, Response } from "express";
import { mistRouter } from "./mist.routes.js";

export const registerRoutes = (app: Express): void => {
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, service: "backend" });
  });

  app.use("/api/v1/mist", mistRouter);
};
