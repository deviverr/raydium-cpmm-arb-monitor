#!/usr/bin/env bash
# Stream the structured JSON log in real time. Run this in a 2nd terminal
# while the monitor is running in the first.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/arb-monitor.log"

if [ ! -f "$LOG" ]; then
  echo "Log file not found: $LOG"
  echo "Start the monitor first (e.g., bash tests/run-sol-usdc.sh)"
  exit 1
fi

# If jq is installed, pretty-print. Otherwise raw tail.
if command -v jq >/dev/null 2>&1; then
  tail -f "$LOG" | jq -c '{t: .timestamp, lvl: .level, msg: .message}'
else
  tail -f "$LOG"
fi
