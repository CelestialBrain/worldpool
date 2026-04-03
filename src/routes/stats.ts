// ─── Stats Routes ─────────────────────────────────────────────────────────────
// GET /stats — pool health and protocol breakdown

import { Hono } from 'hono';
import { getStats } from '../models/proxy.js';

const stats = new Hono();

stats.get('/stats', (c) => {
  const data = getStats();
  return c.json(data);
});

export default stats;
