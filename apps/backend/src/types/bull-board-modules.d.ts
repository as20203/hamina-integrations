/**
 * Fallback declarations when @bull-board packages are not yet installed in node_modules.
 * When packages are present, TypeScript prefers their bundled types.
 */
declare module "@bull-board/api" {
  export function createBullBoard(options: {
    queues: unknown[];
    serverAdapter: unknown;
  }): void;
}

declare module "@bull-board/api/bullMQAdapter" {
  export class BullMQAdapter {
    constructor(queue: unknown);
  }
}

declare module "@bull-board/express" {
  import type { Router } from "express";

  export class ExpressAdapter {
    setBasePath(path: string): void;
    getRouter(): Router;
  }
}
