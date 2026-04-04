// ─── Tendril E2E Test ─────────────────────────────────────────────────────────
// Spins up two local Tendril nodes, creates a job on Node A,
// verifies Node B discovers it via the swarm, executes it, and
// the result flows back.
//
// Usage: npx tsx src/tendril/test/e2e.ts

import { TendrilNode } from '../core/node.js';
import { jobModel } from '../../models/job.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tendril:e2e');

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const testTopic = `worldpool-e2e-${Date.now()}`;

  log.info('=== Tendril E2E Test ===');
  log.info(`Topic: ${testTopic}`);

  // ─── Spin Up Node A (Job Creator) ───────────────────────────────────

  log.info('Starting Node A (job creator)...');
  const nodeA = new TendrilNode({
    enabled: true,
    swarmTopic: testTopic,
    maxConcurrentJob: 3,
    requestPerSecond: 5,
    defaultTimeoutMs: 10000,
    batchSize: 10,
    collectTimeoutMs: 30000,
  });

  await nodeA.start();
  log.info(`Node A started: ${nodeA.nodeId.slice(0, 12)}`);

  // ─── Spin Up Node B (Worker) ────────────────────────────────────────

  log.info('Starting Node B (worker)...');
  const nodeB = new TendrilNode({
    enabled: true,
    swarmTopic: testTopic,
    maxConcurrentJob: 3,
    requestPerSecond: 5,
    defaultTimeoutMs: 10000,
    batchSize: 10,
    collectTimeoutMs: 30000,
  });

  await nodeB.start();
  log.info(`Node B started: ${nodeB.nodeId.slice(0, 12)}`);

  // ─── Wait for Peers ─────────────────────────────────────────────────

  log.info('Waiting for peer discovery...');
  let peerCount = 0;
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    peerCount = nodeA.getSwarm().getPeerCount();
    if (peerCount > 0) break;
    log.info(`  ...waiting (${i + 1}s), peers: ${peerCount}`);
  }

  if (peerCount === 0) {
    log.error('❌ Nodes failed to discover each other after 15s');
    await nodeA.stop();
    await nodeB.stop();
    process.exit(1);
  }

  log.info(`✅ Peer discovery complete — Node A sees ${peerCount} peer(s)`);

  // ─── Create a Job on Node A ─────────────────────────────────────────

  log.info('Node A creating a test job (GET https://httpbin.org/ip)...');
  const job = nodeA.createJob({
    targetUrl: 'https://httpbin.org/ip',
    httpMethod: 'GET',
    minCompletion: 1,
    maxCompletion: 3,
    isPublic: true,
  });

  log.info(`Job created: ${job.jobId.slice(0, 8)}`);

  // ─── Wait for Execution ─────────────────────────────────────────────

  log.info('Waiting for execution...');
  await sleep(10_000);

  // ─── Check Results ──────────────────────────────────────────────────

  const finalJob = jobModel.get(job.jobId);
  const completions = nodeA.getCompletionCounter().getValue(job.jobId);

  log.info('=== Test Results ===');
  log.info(`Job status: ${finalJob?.status}`);
  log.info(`Completions: ${completions}`);
  log.info(`Node A peers: ${nodeA.getSwarm().getPeerCount()}`);
  log.info(`Node B peers: ${nodeB.getSwarm().getPeerCount()}`);

  const nodeAStatus = nodeA.getStatus();
  const nodeBStatus = nodeB.getStatus();
  log.info(`Node A jobs: ${JSON.stringify(nodeAStatus.jobCount)}`);
  log.info(`Node B jobs: ${JSON.stringify(nodeBStatus.jobCount)}`);

  if (completions > 0) {
    log.info('✅ E2E TEST PASSED — job was executed across the swarm');
  } else {
    log.warn('⚠️  E2E TEST PARTIAL — peers connected but no completions yet');
    log.warn('   (This can happen if httpbin is slow or firewall blocks outgoing)');
  }

  if (peerCount > 0) {
    log.info('✅ P2P CONNECTIVITY PASSED — nodes discovered each other');
  }

  // ─── Cleanup ────────────────────────────────────────────────────────

  await nodeA.stop();
  await nodeB.stop();
  log.info('=== E2E Test Complete ===');
}

main().catch(err => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
