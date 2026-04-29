#!/usr/bin/env bash
# POPCAT / SOL — popular memecoin, more active CPMM pools.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

POPCAT=7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr
SOL=So11111111111111111111111111111111111111112

echo "Running raydium-cpmm-arb-monitor on POPCAT / SOL"
echo "Ctrl+C to exit. Logs → arb-monitor.log"
echo ""
exec npm run dev -- "$POPCAT" "$SOL"
