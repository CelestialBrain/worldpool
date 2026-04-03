// ─── Admin Routes ─────────────────────────────────────────────────────────────
// POST /refresh — manually trigger pipeline run (requires X-Admin-Token)

import { Hono } from 'hono';
import { config } from '../config.js';
import { runPipeline } from '../services/pipeline.js';
import { getStats } from '../models/proxy.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('route:admin');

const admin = new Hono();

admin.post('/refresh', async (c) => {
  const token = c.req.header('X-Admin-Token');
  if (token !== config.adminToken) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    await runPipeline();
    const stats = getStats();
    return c.json({ ok: true, alive_count: stats.alive_count });
  } catch (err) {
    log.error('Pipeline failed via /refresh', { error: String(err) });
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

export default admin;
