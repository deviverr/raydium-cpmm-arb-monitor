#!/usr/bin/env bash
# Reset local state: remove .env, log file, dist build.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

rm -f .env arb-monitor.log
rm -rf dist
echo "Cleaned: .env, arb-monitor.log, dist/"
