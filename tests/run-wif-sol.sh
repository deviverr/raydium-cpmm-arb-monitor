#!/usr/bin/env bash
# WIF / SOL — dogwifhat memecoin pair.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WIF=EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm
SOL=So11111111111111111111111111111111111111112

echo "Running raydium-cpmm-arb-monitor on WIF / SOL"
echo "Ctrl+C to exit. Logs → arb-monitor.log"
echo ""
exec npm run dev -- "$WIF" "$SOL"
