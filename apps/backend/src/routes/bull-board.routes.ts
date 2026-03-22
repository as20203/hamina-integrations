import { Router, type Request, type Response, type NextFunction } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { mistQueue } from '../lib/mist/mist-queue.js';

// Create Bull Board server adapter
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Create Bull Board with our queue
createBullBoard({
  queues: [new BullMQAdapter(mistQueue)],
  serverAdapter,
});

// Basic authentication middleware
const basicAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');
  
  const expectedUsername = process.env.BASIC_AUTH_USER || 'admin';
  const expectedPassword = process.env.BASIC_AUTH_PASS || 'changeme';
  
  if (username !== expectedUsername || password !== expectedPassword) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  next();
};

// Create router and apply basic auth
const bullBoardRouter = Router();
bullBoardRouter.use('/admin/queues', basicAuth, serverAdapter.getRouter());

export { bullBoardRouter };