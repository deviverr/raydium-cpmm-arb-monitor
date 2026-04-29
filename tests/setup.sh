#!/usr/bin/env bash
# Copy tests/.env.test to project root .env so the tool finds it.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

if [ ! -f "$HERE/.env.test" ]; then
  echo "ERROR: tests/.env.test not found. Create it with your RPC_ENDPOINT first."
  exit 1
fi

cp "$HERE/.env.test" "$ROOT/.env"
echo "Copied tests/.env.test → .env"
echo ""
echo "Verify .env contents (key masked):"
sed 's/api-key=.*/api-key=***/' "$ROOT/.env"
