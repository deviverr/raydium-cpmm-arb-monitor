#!/usr/bin/env bash
# SOL / USDC — canonical pair. Many CPMM pools, mostly small liquidity.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SOL=So11111111111111111111111111111111111111112
USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

echo "Running raydium-cpmm-arb-monitor on SOL / USDC"
echo "Ctrl+C to exit. Logs → arb-monitor.log"
echo ""
exec npm run dev -- "$SOL" "$USDC"
