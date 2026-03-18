import express, { type Express } from "express";
import "dotenv/config";
import { registerRoutes } from "./src/index.js";

const resolvePort = (): number => {
  const rawPort = process.env.PORT;
  if (!rawPort) {
    return 4000;
  }

  const parsedPort = Number(rawPort);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return parsedPort;
};

const start = (): void => {
  const app: Express = express();
  const port = resolvePort();

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json());
  registerRoutes(app);

  const server = app.listen(port, () => {
    console.log(`[backend] listening on ${port}`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[backend] received ${signal}, shutting down...`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
};

start();
