#!/usr/bin/env bash
# Run demo mode — no .env or RPC key needed.
# Shows 3 synthetic pools with profitable arb opportunities.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Running raydium-cpmm-arb-monitor in DEMO mode"
echo "No RPC key required. Ctrl+C to exit."
echo ""
exec npm run dev:demo
