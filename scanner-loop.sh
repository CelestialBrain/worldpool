#!/bin/bash
# Worldpool VPS Scanner Loop
# Runs continuously via systemd. Probes known IPs for open proxy ports,
# writes discoveries, pushes to repo for Actions pipeline to validate.
cd /opt/worldpool

while true; do
  echo "[$(date -u)] Scanner run starting..."

  # Reset local changes and pull latest
  git checkout -- . 2>/dev/null
  git clean -fd --exclude=node_modules 2>/dev/null
  git pull origin main --quiet 2>/dev/null

  # Extract IPs from all-ever-seen.txt
  cut -d: -f1 proxies/all-ever-seen.txt 2>/dev/null | sort -u > /tmp/scan-targets.txt
  cp /tmp/scan-targets.txt data/scan-targets.txt

  # Run scanner
  npx tsx run-scanner.ts 2>&1

  # Push results if any
  if [ -f data/scanner-discovered.txt ] && [ -s data/scanner-discovered.txt ]; then
    FOUND=$(wc -l < data/scanner-discovered.txt | tr -d " ")
    echo "[$(date -u)] Found $FOUND proxies, pushing..."

    # Save results, pull clean, restore, commit, push
    cp data/scanner-discovered.txt /tmp/scanner-discovered.txt
    git checkout -- . 2>/dev/null
    git pull origin main --quiet 2>/dev/null
    cp /tmp/scanner-discovered.txt data/scanner-discovered.txt

    git config user.name "worldpool-scanner"
    git config user.email "scanner@worldpool"
    git add data/scanner-discovered.txt
    git commit -m "chore: scanner discovered $FOUND proxies [$(date -u +%Y-%m-%d)]" --quiet 2>/dev/null
    git push origin main 2>&1 || echo "[$(date -u)] Push failed"

    echo "[$(date -u)] Done"
  fi

  echo "[$(date -u)] Cycle complete. Next in 10s..."
  sleep 10
done
