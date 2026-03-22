import type { NextFunction, Request, Response } from "express";

const allowedTypes = new Set(["ap", "switch"]);
const allowedStatuses = new Set(["connected", "disconnected"]);

const validateMistDeviceQuery = (req: Request, res: Response, next: NextFunction): void => {
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  if (type && !allowedTypes.has(type)) {
    res.status(400).json({ ok: false, error: "Invalid type filter. Use ap|switch" });
    return;
  }

  if (status && !allowedStatuses.has(status)) {
    res.status(400).json({ ok: false, error: "Invalid status filter. Use connected|disconnected" });
    return;
  }

  next();
};

export { validateMistDeviceQuery };
