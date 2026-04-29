# raydium-cpmm-arb-monitor

A real-time arbitrage monitoring tool for [Raydium CPMM](https://docs.raydium.io/raydium/build/developer-guides/cpmm) pools on Solana.

Given two SPL token mint addresses, the tool discovers every CPMM pool that trades that pair, continuously fetches live reserves, computes spot prices, simulates a 2-leg buy/sell against every candidate pool combination, and surfaces a ranked, live-updating list of profitable arbitrage opportunities — net of swap fees and transaction costs.

> **Status:** Read-only monitoring tool. It does **not** execute trades, sign transactions, or hold private keys. It is designed for traders, researchers, and bot operators who want to understand where Raydium CPMM cross-pool inefficiency exists for a given pair.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [Usage Examples](#usage-examples)
- [How Prices Are Calculated](#how-prices-are-calculated)
- [How Net Profit Is Calculated](#how-net-profit-is-calculated)
- [Logging & Observability](#logging--observability)
- [Project Layout](#project-layout)
- [Limitations & Notes](#limitations--notes)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Pool discovery**: given two mint addresses, discovers every CPMM pool for that token pair via on-chain `getProgramAccounts` with memcmp filters on the pool state layout.
- **Real-time prices**: continuously polls token vault balances and recomputes spot prices on a configurable interval.
- **Per-pool fee awareness**: reads each pool's `AmmConfig` and applies the correct trade fee tier (0.25%, 1%, 2%, 4%, or any future tier) when simulating swaps.
- **Net profit simulation**: simulates a full 2-leg arbitrage (buy in pool X, sell in pool Y) using the constant-product formula with fees, including a configurable transaction-cost deduction.
- **Ranked output**: opportunities sorted by net profit. Color-coded: above-threshold (green), positive but below threshold (yellow), break-even or worse (gray).
- **Structured logging**: every pool discovery, price update, opportunity, and error is logged as JSON to a file with timestamps and log levels.
- **Configurable**: RPC endpoint, polling interval, trade size, minimum profit threshold, transaction cost, and log level all configurable via `.env`.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLI entry (index.ts)                      │
│   - parses mint pair from argv                                    │
│   - loads config, initializes logger                              │
│   - runs discovery once, then enters tick loop                    │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                       discovery.ts (one-shot)                     │
│   getProgramAccounts(CPMM)                                        │
│     filters: dataSize + memcmp(mintA @ offset 168)                │
│              + memcmp(mintB @ offset 200)                         │
│   runs forward & reverse mint order, dedupes by pool pubkey       │
│   decodes pool state via CpmmPoolInfoLayout                       │
│   batches getMultipleAccountsInfo for AmmConfig fee tiers         │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                       price.ts (every tick)                       │
│   getMultipleAccountsInfo([vaultA, vaultB] for each pool)         │
│   decode SPL token accounts → reserves (BN)                       │
│   compute spot price = reserveB / reserveA  (decimal-adjusted)    │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                     arbitrage.ts (every tick)                     │
│   for each (buyPool, sellPool) pair:                              │
│     leg 1: tradeAmount → tokenB in buyPool   (with buy fee)       │
│     leg 2: tokenB → tokenA in sellPool       (with sell fee)      │
│     gross = output - input                                        │
│     net = gross - tx_cost                                         │
│   sort opportunities by net profit, rank, threshold-flag          │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                     display.ts (every tick)                       │
│   clears screen, draws price table + ranked arb table             │
│                                                                   │
│                     logger.ts (every tick)                        │
│   winston: structured JSON file logs + console (off during TUI)   │
└──────────────────────────────────────────────────────────────────┘
```

The tick loop runs every `POLLING_INTERVAL_MS`. The TUI is rendered after each tick by clearing the terminal and reprinting the latest snapshot.

---

## Installation

### Prerequisites

- **Node.js ≥ 18** (Node 20 LTS recommended)
- **npm** or **pnpm** or **yarn**
- A Solana RPC endpoint. Public mainnet RPC (`https://api.mainnet-beta.solana.com`) is rate-limited and **will not work reliably** for `getProgramAccounts` queries. Use a paid provider — [Helius](https://helius.dev) (recommended), [QuickNode](https://www.quicknode.com), or [Triton](https://triton.one).

### Setup

```bash
git clone https://github.com/<your-username>/raydium-cpmm-arb-monitor.git
cd raydium-cpmm-arb-monitor
npm install
cp .env.example .env
# edit .env with your RPC endpoint
npm run build
```

To run from source without building:

```bash
npm run dev -- <mintA> <mintB>
```

To run the compiled binary:

```bash
npm run build
node dist/index.js <mintA> <mintB>
```

---

## Quick Start

Monitor SOL/USDC arbitrage opportunities across all Raydium CPMM pools:

```bash
npm run dev -- \
  So11111111111111111111111111111111111111112 \
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

The first argument is **tokenA** (input/output token of the simulated arbitrage). The second is **tokenB** (intermediate token).

The simulated trade flow is:

```
tradeAmount of tokenA  →  buyPool  →  tokenB  →  sellPool  →  tokenA
                                                              ↑
                                                  hopefully more than you started with
```

---

## Configuration Reference

All configuration is read from `.env` at the project root. Defaults apply when a value is missing. See `.env.example` for a copy-pasteable template.

| Variable                | Type    | Default                | Description                                                                                          |
| ----------------------- | ------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `RPC_ENDPOINT`          | string  | **required**           | Solana JSON-RPC endpoint. Must support `getProgramAccounts` and `getMultipleAccountsInfo`.           |
| `POLLING_INTERVAL_MS`   | number  | `5000`                 | Milliseconds between price refreshes. Minimum `500`. Lower values stress your RPC quota.             |
| `MIN_PROFIT_THRESHOLD`  | number  | `0.0001`               | Minimum net profit (in tokenA units) before an opportunity is flagged green/`meetsThreshold`.        |
| `TRADE_AMOUNT`          | number  | `1`                    | Notional trade size in tokenA units used for the simulation. Larger sizes incur more price impact.   |
| `TX_COST_LAMPORTS`      | number  | `10000`                | Estimated total transaction cost (base + priority fees) for the 2-leg arbitrage, in lamports.        |
| `LOG_LEVEL`             | string  | `info`                 | Winston log level: `debug`, `info`, `warn`, `error`.                                                 |
| `LOG_FILE`              | string  | `arb-monitor.log`      | Path to the JSON log file (relative or absolute).                                                    |

> **Tx cost note.** `TX_COST_LAMPORTS` is converted to tokenA units only when **tokenA is wrapped SOL** (`So11...112`). For non-SOL input tokens, the deduction is `0` — gross profit and net profit will be effectively equal. Most CPMM arbitrage on Solana is dominated by swap fees rather than tx cost, so this is a reasonable approximation, but you can tune it for your use case.

---

## Usage Examples

### Example 1 — SOL / USDC

```bash
npm run dev -- \
  So11111111111111111111111111111111111111112 \
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Sample output (truncated):

```
  Raydium CPMM Arbitrage Monitor   v0.1.0  iteration #4  uptime 18s
  Pair: So11…1112 / EPjF…Dt1v   Pools: 3   Updated: 2026-04-29 14:02:11
  Polling: 5000ms   Trade size: 1   Min profit: 0.0001
  RPC: https://mainnet.helius-rpc.com/?api-key=***

  Pool Prices
  ┌──────────┬──────────────────────┬───────────┬────────────┬────────┐
  │ Pool     │ Spot Price (B per A) │ Reserve A │ Reserve B  │ Fee    │
  ├──────────┼──────────────────────┼───────────┼────────────┼────────┤
  │ 3xAb…7yZ │           134.812341 │   1820.20 │ 245412.18  │ 0.250% │
  │ 9mNp…2qW │           134.998120 │    430.55 │  58127.90  │ 1.000% │
  │ 7Yba…4dF │           135.103045 │   2110.71 │ 285178.55  │ 0.250% │
  └──────────┴──────────────────────┴───────────┴────────────┴────────┘

  Arbitrage Opportunities (ranked by net profit)
  ┌───┬──────────┬──────────┬───────────┬───────────┬─────────┬───────────────┬────────────┬───────────────┐
  │ # │ Buy Pool │ Sell Pool│ Buy Price │ Sell Price│ Diff %  │ Gross         │ Tx Cost    │ Net Profit    │
  ├───┼──────────┼──────────┼───────────┼───────────┼─────────┼───────────────┼────────────┼───────────────┤
  │ 1 │ 3xAb…7yZ │ 7Yba…4dF │ 134.81234 │ 135.10305 │ 0.2156% │ +0.00091234   │ 0.00001000 │ +0.00090234   │
  │ 2 │ 3xAb…7yZ │ 9mNp…2qW │ 134.81234 │ 134.99812 │ 0.1378% │ +0.00040118   │ 0.00001000 │ +0.00039118   │
  └───┴──────────┴──────────┴───────────┴───────────┴─────────┴───────────────┴────────────┴───────────────┘
  2 opportunities found, 2 above threshold (0.0001)

  Ctrl+C to exit. Logs streamed to file (see LOG_FILE).
```

### Example 2 — Run with custom config inline

```bash
RPC_ENDPOINT=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY \
POLLING_INTERVAL_MS=2000 \
TRADE_AMOUNT=10 \
MIN_PROFIT_THRESHOLD=0.01 \
LOG_LEVEL=debug \
npm run dev -- So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### Example 3 — Tail the log while the monitor runs

In another terminal:

```bash
tail -f arb-monitor.log | jq .
```

You'll see structured JSON entries like:

```json
{"level":"info","message":"Pool discovery complete: found 3 pool(s)","poolIds":["3xAb...","9mNp...","7Yba..."],"timestamp":"2026-04-29T14:01:53.221Z"}
{"level":"warn","message":"Arbitrage opportunity above threshold","rank":1,"buyPool":"3xAb...","sellPool":"7Yba...","buyPrice":134.812341,"sellPrice":135.103045,"priceDiffPercent":0.2156,"netProfit":0.00090234,"tradeAmount":1,"timestamp":"2026-04-29T14:02:11.110Z"}
```

---

## How Prices Are Calculated

Raydium's CPMM uses the classic **constant-product** formula `x · y = k`. For a pool with reserves `R_A` of tokenA and `R_B` of tokenB, the **spot price** of tokenA in tokenB units is:

```
spotPrice =  (R_B / 10^decimalsB)  /  (R_A / 10^decimalsA)
```

Both reserves are read live each tick from the SPL token vault accounts (`pool.vaultA`, `pool.vaultB`) — no caching, no API. This is the same source of truth that Raydium's program reads when executing swaps.

The reported "Spot Price" column is the no-slippage marginal price. The **effective price** for any non-zero trade size is worse than this due to:

1. The swap fee (deducted from the input before the curve is applied).
2. Curve impact (the bigger the trade relative to reserves, the worse the effective rate).

The arbitrage simulator accounts for both of these — see the next section.

---

## How Net Profit Is Calculated

For each ordered pair of pools `(buyPool, sellPool)`, the tool simulates the full round-trip:

### Leg 1 — buy tokenB by spending tokenA in `buyPool`

```
fee_buy        = buyPool.tradeFeeRate / 1_000_000
amountInAfter1 = tradeAmount * (1 - fee_buy)
amountOutB     = (R_B_buy * amountInAfter1) / (R_A_buy + amountInAfter1)
```

### Leg 2 — sell that tokenB back to tokenA in `sellPool`

```
fee_sell       = sellPool.tradeFeeRate / 1_000_000
amountInAfter2 = amountOutB * (1 - fee_sell)
amountOutA     = (R_A_sell * amountInAfter2) / (R_B_sell + amountInAfter2)
```

### Profit

```
gross_profit  = amountOutA - tradeAmount
net_profit    = gross_profit - tx_cost
```

`tx_cost` is `TX_COST_LAMPORTS / 10⁹` when tokenA is wrapped SOL, otherwise `0` (see [Configuration Reference](#configuration-reference)).

### Fee model

Raydium CPMM's `AmmConfig` accounts store `tradeFeeRate` denominated in **hundredths of a basis point** (denominator `1_000_000`). For example, `tradeFeeRate = 2500` ⇒ `0.25%`. The full trade fee is applied on the input side; protocol/fund splits of that fee are *internal* to the LP/protocol distribution and do **not** affect the trader's effective swap rate, so the simulator only needs `tradeFeeRate`.

The simulator considers **all ordered pool combinations**, so a 3-pool universe produces 6 candidate arbitrages (`3 × 2`). Every candidate is simulated independently each tick — there is no caching across ticks, so reserve changes are immediately reflected.

### Ranking & threshold

Opportunities are sorted by `net_profit` descending. The top 10 are displayed. An opportunity is **above threshold** when `net_profit >= MIN_PROFIT_THRESHOLD`; only those trigger a `warn`-level log entry.

---

## Logging & Observability

[Winston](https://github.com/winstonjs/winston) is configured with two transports:

- **File** (`LOG_FILE`, default `arb-monitor.log`) — JSON format, one event per line, with ISO timestamps. Great for `jq`, log shippers, or grep.
- **Console** — human-readable format. Suppressed while the TUI is rendering so it doesn't clobber the table; re-enabled on shutdown so you see exit-time logs.

Levels:

| Level   | What gets logged                                                                  |
| ------- | --------------------------------------------------------------------------------- |
| `error` | RPC failures, decode errors, fatal startup errors.                                |
| `warn`  | Arbitrage opportunities above threshold; missing accounts; degraded pool states.  |
| `info`  | Startup, pool discovery completion, shutdown.                                     |
| `debug` | Per-pool decode results, per-tick durations, individual price snapshots.          |

Each log entry includes structured metadata: pool IDs, prices, profit values, durations, error messages. There is no string interpolation in log payloads — everything is queryable JSON.

---

## Project Layout

```
.
├── src/
│   ├── index.ts        — CLI entry point, tick loop, signal handling
│   ├── config.ts       — env loading, validation, mint arg parsing
│   ├── types.ts        — shared TypeScript interfaces
│   ├── logger.ts       — winston setup with file + console transports
│   ├── discovery.ts    — pool discovery via getProgramAccounts, AmmConfig batch fetch
│   ├── price.ts        — vault balance fetch, spot price calc, snapshot helpers
│   ├── arbitrage.ts    — 2-leg swap simulator, opportunity ranking
│   └── display.ts      — chalk + cli-table3 TUI rendering
├── .env.example
├── .gitignore
├── LICENSE             — MIT
├── package.json
├── tsconfig.json
└── README.md
```

Each module has a single, narrow responsibility. Discovery is purely on-chain account scanning; price is purely reserve fetching + arithmetic; arbitrage is purely numeric simulation; display is purely rendering. Configuration and logging are isolated singletons that the rest of the code reads from.

---

## Limitations & Notes

- **Read-only.** This tool does **not** sign or send transactions. It is a monitor.
- **No slippage tolerance modeling beyond curve impact.** Real execution will face additional adversarial slippage (sandwich attacks, MEV, frontrunning by other arb bots).
- **Tx cost is approximate.** Real-world arbitrage requires Jito tips and competitive priority fees. Tune `TX_COST_LAMPORTS` accordingly if you intend to use this as a signal source for live trading.
- **CPMM only.** Raydium's CLMM, AMM v4, and other DEXes (Orca, Meteora) are out of scope. Adding them would require their respective pool layouts and curve math.
- **`getProgramAccounts` requires an indexed RPC.** The default Solana mainnet-beta endpoint is too rate-limited to do this reliably. Use Helius, QuickNode, or Triton.
- **Mint pair argument order does not matter for discovery** — the tool searches both orderings — but the **first argument is treated as the input token** in the simulation. Choose your tokenA carefully.

---

## Contributing

Contributions welcome. Open a PR.

Suggested improvements:

- Add CLMM and AMM v4 pool support behind feature flags.
- WebSocket-based reserve subscription instead of polling.
- Multi-hop arbitrage path search (currently only 2-leg).
- Optional Jupiter / Birdeye price comparison column.
- Telegram / Discord webhook alerts on threshold breach.
- Tests for the swap simulator using fixture pool states.

---

## License

MIT — see [LICENSE](LICENSE).

This tool is provided as-is, with no warranty. Trading is risky. Do your own research. The authors are not responsible for any losses incurred from acting on signals this tool produces.
