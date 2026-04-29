# tests/ — quick test harness

Scripts to run `raydium-cpmm-arb-monitor` against various live token pairs without manually typing mint addresses each time.

> **Note:** `tests/.env.test` contains a real RPC API key and is gitignored. Keep it local.

## One-time setup

From the project root:

```bash
# 1. Install deps + build (only needed once)
npm install
npm run build
```

Then copy the prebuilt env file to project root:

```bash
# bash / git bash / mac / linux:
bash tests/setup.sh

# Windows cmd:
tests\setup.cmd
```

This copies `tests/.env.test` → `.env` so the tool can read your RPC endpoint.

## Run a test

Each script runs the monitor on a different token pair. Pick one:

| Script              | Pair         | Notes                                          |
| ------------------- | ------------ | ---------------------------------------------- |
| `run-sol-usdc.sh`   | SOL / USDC   | Many CPMM pools, mostly small liquidity.       |
| `run-popcat-sol.sh` | POPCAT / SOL | Active memecoin pair.                          |
| `run-wif-sol.sh`    | WIF / SOL    | dogwifhat memecoin.                            |
| `run-jup-sol.sh`    | JUP / SOL    | Jupiter governance token.                      |
| `run-debug.sh`      | SOL / USDC   | Debug log level + 2s polling. Verbose output.  |

### bash / git bash / mac / linux

```bash
bash tests/run-sol-usdc.sh
bash tests/run-popcat-sol.sh
bash tests/run-debug.sh
```

### Windows cmd

```cmd
tests\run-sol-usdc.cmd
tests\run-popcat-sol.cmd
tests\run-debug.cmd
```

`Ctrl+C` to exit. The TUI clears the screen and redraws every `POLLING_INTERVAL_MS` (default 5s).

## Watch the log file

In a **second terminal** while the monitor is running:

```bash
bash tests/tail-logs.sh        # uses jq if installed for pretty JSON
```

```cmd
tests\tail-logs.cmd            # uses PowerShell Get-Content -Wait
```

Each line is a JSON record with timestamp, level, message, and structured metadata.

## Reset / clean

```bash
bash tests/clean.sh
```

```cmd
tests\clean.cmd
```

Removes `.env`, `arb-monitor.log`, and `dist/`. Useful when you want to test a fresh setup.

## Try your own pair

Look up any two SPL token mint addresses (e.g., on [solscan.io](https://solscan.io)) and run:

```bash
npm run dev -- <mintA> <mintB>
```

The first argument is the input/output token of the simulated arbitrage. The second is the intermediate.

## What you should see

- A live-updating terminal table with two sections: **Pool Prices** (one row per discovered pool) and **Arbitrage Opportunities** (top 10 ranked by net profit).
- Color coding: green = above `MIN_PROFIT_THRESHOLD`, yellow = positive but below threshold, gray = unprofitable.
- Status header showing iteration #, uptime, pair, pool count, polling interval, RPC endpoint (key masked).

## Troubleshooting

- **`Missing required environment variable: RPC_ENDPOINT`** — run `tests/setup.sh` first.
- **`Pool discovery failed: fetch failed`** — RPC endpoint is unreachable. Check the URL in `.env` and your network/firewall (ESET sometimes blocks Solana RPCs — whitelist the domain).
- **`Found only 0 pool(s)`** — no CPMM pools exist for that mint pair. Try a different pair (memecoins are usually CPMM; SOL/USDC mainstream volume is on CLMM).
- **TUI looks broken** — terminal is too narrow. Resize wider, or pipe to a file: `npm run dev -- <mintA> <mintB> > out.txt`.
