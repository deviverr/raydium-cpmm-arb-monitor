#!/usr/bin/env bash
# Verbose debug mode on SOL/USDC. Faster polling (2s), debug logs.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SOL=So11111111111111111111111111111111111111112
USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

echo "Running in DEBUG mode: 2s polling, debug log level"
echo "Ctrl+C to exit. Logs → arb-monitor.log"
echo ""
LOG_LEVEL=debug POLLING_INTERVAL_MS=2000 exec npm run dev -- "$SOL" "$USDC"
