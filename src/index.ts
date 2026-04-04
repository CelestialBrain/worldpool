// ─── Worldpool Entry Point ────────────────────────────────────────────────────
// Starts the Hono server and mounts all routes.

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { rateLimit } from './middleware/rate-limit.js';
import proxyRoutes from './routes/proxy.js';
import statsRoutes from './routes/stats.js';
import adminRoutes from './routes/admin.js';
import optoutRoutes from './services/optout.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('server');

const app = new Hono();

// Rate limiting — 60 requests/min per IP
app.use('*', rateLimit());

// Health check
app.get('/', (c) => c.json({ name: 'worldpool', status: 'ok' }));

// Mount routes
app.route('/', proxyRoutes);
app.route('/', statsRoutes);
app.route('/', adminRoutes);
app.route('/', optoutRoutes);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info(`Worldpool server running`, { port: info.port });
});

export default app;
