process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED:", err);
});

import { config } from "./src/config.js";
import { loadTargets } from "./src/scrapers/scanner/targets.js";
import { loadExclusions } from "./src/scrapers/scanner/exclude.js";
import { probeBatch } from "./src/scrapers/scanner/tcp-probe.js";
import { createLogger } from "./src/utils/logger.js";
import { writeFileSync } from "fs";

const log = createLogger("scanner-runner");
const CHUNK_SIZE = 10_000;

async function main() {
  log.info("Scanner starting...");

  const allIps = loadTargets(config.scanner.targetsFile);
  const isExcluded = loadExclusions(config.scanner.excludeFile);
  const ips = allIps.filter(ip => !isExcluded(ip));

  log.info(`Loaded ${ips.length} target IPs`);

  const ports = config.scanner.ports;
  const targets = ips.flatMap(ip => ports.map(port => ({ ip, port })));
  log.info(`Total probes: ${targets.length}`);

  const allOpen: Array<{ ip: string; port: number }> = [];

  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE);
    const n = Math.floor(i / CHUNK_SIZE) + 1;
    const total = Math.ceil(targets.length / CHUNK_SIZE);

    try {
      const open = await probeBatch(chunk, config.scanner.concurrency, config.scanner.ratePps, config.scanner.timeoutMs);
      for (const r of open) allOpen.push(r);
      log.info(`Chunk ${n}/${total}: ${open.length} open (total: ${allOpen.length})`);
    } catch (err) {
      log.error(`Chunk ${n} failed: ${err}`);
    }
  }

  log.info(`TCP probe done: ${allOpen.length} open ports`);

  if (allOpen.length === 0) {
    log.info("No open ports found");
    return;
  }

  const lines = allOpen.map(({ ip, port }) => `${ip}:${port}`);
  writeFileSync("data/scanner-discovered.txt", lines.join("\n") + "\n");
  log.info(`Wrote ${lines.length} discovered proxies to data/scanner-discovered.txt`);
}

main().catch(err => {
  console.error("Scanner failed:", err);
  process.exit(1);
});
