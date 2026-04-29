#!/usr/bin/env bash
# JUP / SOL — Jupiter governance token.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

JUP=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
SOL=So11111111111111111111111111111111111111112

echo "Running raydium-cpmm-arb-monitor on JUP / SOL"
echo "Ctrl+C to exit. Logs → arb-monitor.log"
echo ""
exec npm run dev -- "$JUP" "$SOL"
