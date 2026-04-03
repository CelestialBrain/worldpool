// ─── Pipeline CLI Entry Point ─────────────────────────────────────────────────
// Called by `npm run pipeline` and GitHub Actions.
// Runs the full pipeline and exits.

import { runPipeline } from './services/pipeline.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('cli');

runPipeline()
  .then(() => {
    log.info('Pipeline finished successfully');
    process.exit(0);
  })
  .catch((err) => {
    log.error('Pipeline failed', { error: String(err) });
    process.exit(1);
  });
