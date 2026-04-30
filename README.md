# raydium-cpmm-arb-monitor

![Arbitrage Monitor Screenshot](Знімок%20екрана%202026-04-29%20235539.png)

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
- [Optimal Trade Size](#optimal-trade-size)
- [Price Impact Detection](#price-impact-detection)
- [Logging & Observability](#logging--observability)
- [Project Layout](#project-layout)
- [Running Tests](#running-tests)
- [Limitations & Notes](#limitations--notes)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Pool discovery**: given two mint addresses, discovers every CPMM pool for that token pair via on-chain `getProgramAccounts` with memcmp filters on the pool state layout.
- **Real-time prices**: continuously polls token vault balances and recomputes spot prices on a configurable interval. Liquidity health (LOW / OK) flagged per pool.
- **Per-pool fee awareness**: reads each pool's `AmmConfig` and applies the correct trade fee tier (0.25%, 1%, 2%, 4%, or any future tier) when simulating swaps.
- **Net profit simulation**: simulates a full 2-leg arbitrage (buy in pool X, sell in pool Y) using the constant-product formula with fees, including a configurable transaction-cost deduction.
- **Optimal trade size**: ternary search finds the profit-maximizing input amount for each candidate pool pair — shown alongside your configured `TRADE_AMOUNT`.
- **Price impact detection**: warns when `TRADE_AMOUNT` exceeds 10% of the buy pool's reserve, preventing misleading profit estimates on thin pools.
- **Ranked output**: opportunities sorted by net profit. Color-coded: above-threshold (green), positive but below threshold (yellow), break-even or worse (gray).
- **Structured logging**: pool discovery, per-tick price snapshots, every arb candidate (debug), above-threshold alerts (warn), and errors — all JSON with timestamps.
- **Configurable**: RPC endpoint, polling interval, trade size, minimum profit threshold, transaction cost, and log level all configurable via `.env`.
- **`--help` flag**: `node dist/index.js --help` prints full usage with common mint pairs and configuration reference.

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
  Raydium CPMM Arbitrage Monitor   v0.1.0  iteration #4  uptime 18s  scan 312ms
  Pair: So11…1112 / EPjF…Dt1v   Pools: 3   Updated: 2026-04-29 14:02:11
  Polling: 5000ms   Trade size: 1   Min profit: 0.0001
  RPC: https://mainnet.helius-rpc.com/?api-key=***

  Pool Prices
  ┌──────────┬──────────────────────┬───────────┬────────────┬──────┬────────┐
  │ Pool     │ Spot Price (B per A) │ Reserve A │ Reserve B  │ Liq. │ Fee    │
  ├──────────┼──────────────────────┼───────────┼────────────┼──────┼────────┤
  │ 3xAb…7yZ │           134.812341 │   1820.20 │ 245412.18  │ OK   │ 0.250% │
  │ 9mNp…2qW │           134.998120 │    430.55 │  58127.90  │ OK   │ 1.000% │
  │ 7Yba…4dF │           135.103045 │   2110.71 │ 285178.55  │ OK   │ 0.250% │
  └──────────┴──────────────────────┴───────────┴────────────┴──────┴────────┘

  Arbitrage Opportunities (ranked by net profit)
  ┌───┬──────────┬──────────┬──────────┬────────┬──────────────┬──────────────┬────────────────┐
  │ # │ Buy Pool │ Sell Pool│ Spread % │ Impact │ Net Profit   │ Optimal Size │ Optimal Profit │
  ├───┼──────────┼──────────┼──────────┼────────┼──────────────┼──────────────┼────────────────┤
  │ 1 │ 3xAb…7yZ │ 7Yba…4dF │  0.2156% │  0.1%  │ +0.00090234  │ 3.8120       │ +0.00341200    │
  │ 2 │ 3xAb…7yZ │ 9mNp…2qW │  0.1378% │  0.1%  │ +0.00039118  │ 1.9240       │ +0.00082340    │
  └───┴──────────┴──────────┴──────────┴────────┴──────────────┴──────────────┴────────────────┘
  2 opportunities found, 2 above threshold (0.0001)

  Ctrl+C to exit. Logs streamed to file (see LOG_FILE).
```

**Column guide:**
- **Spread %** — price spread between buy pool and sell pool (positive = profitable direction)
- **Impact** — price impact of `TRADE_AMOUNT` on buy pool reserves; ⚠ appears above 10%
- **Net Profit** — profit after swap fees and tx cost, at configured `TRADE_AMOUNT`
- **Optimal Size** — profit-maximizing input amount found by ternary search
- **Optimal Profit** — net profit at the optimal size (cyan)

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

### Why "No profitable arbitrage detected"?

This is the **expected result for arb-efficient pairs** like SOL/USDC. Dozens of MEV bots and arbitrageurs continuously exploit price differences between Raydium CPMM pools within milliseconds of them appearing. By the time this tool polls (every 5 seconds by default), any meaningful spread has already been closed.

This does **not** mean the tool is broken — it means the market is efficient for that pair. The tool is most useful for:

- **Less-liquid or newly-launched token pairs** where arb bots have not yet optimized coverage.
- **Wider polling intervals** that let discrepancies accumulate before capture.
- **Very small `TRADE_AMOUNT`** to detect micro-inefficiencies below bot profitability thresholds.
- **Pool liquidity monitoring** — pools flagged `LOW` in the Liq. column have stale prices that don't reflect true market value.

Try pairs like `POPCAT/SOL`, `WIF/SOL`, or newly-launched tokens where CPMM pools are primary liquidity venues. See `tests/` for ready-to-run examples.

---

## Optimal Trade Size

For each profitable pool pair `(buyPool, sellPool)`, the tool finds the input amount `x` that maximizes net profit using **ternary search** (40 iterations over `[0, 30% of the smaller pool's reserve]`).

The profit function is:

```
f(x) = amountOut_leg2(amountOut_leg1(x)) - x - tx_cost
```

This is concave (diminishing returns from price impact), so ternary search converges to the global maximum. The search runs in O(log N) with 40 iterations, adding negligible overhead to each tick.

The **Optimal Size** and **Optimal Profit** columns show:
- **Optimal Size** — the profit-maximizing input amount in tokenA units
- **Optimal Profit** — net profit at that size (after both fees and tx cost)

If `Optimal Profit` is significantly larger than `Net Profit`, it means your configured `TRADE_AMOUNT` is suboptimal for that pair — you should increase it (check the Impact column first to ensure it won't cause excessive slippage).

---

## Price Impact Detection

Price impact measures how much a swap moves the pool price against you:

```
priceImpactPct = (TRADE_AMOUNT / pool.reserveA) × 100
```

When `priceImpactPct > 10%`, the opportunity is flagged with a red `⚠` in the **Impact** column. This matters because:

- High impact = large slippage on leg 1 → less tokenB received → reduced gross profit
- Simulated profit at high impact may still be positive, but real execution risk increases
- Very thin pools (LOW liquidity flag) often have inflated spot prices that don't reflect executable rates

**Rule of thumb:** aim for `Impact < 5%` for reliable execution.

---

## Logging & Observability

[Winston](https://github.com/winstonjs/winston) is configured with two transports:

- **File** (`LOG_FILE`, default `arb-monitor.log`) — JSON format, one event per line, with ISO timestamps. Great for `jq`, log shippers, or grep.
- **Console** — human-readable format. Suppressed while the TUI is rendering so it doesn't clobber the table; re-enabled on shutdown so you see exit-time logs.

Levels:

| Level   | What gets logged                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------- |
| `error` | RPC failures, decode errors, fatal startup errors.                                                    |
| `warn`  | Arbitrage opportunities above `MIN_PROFIT_THRESHOLD`; missing accounts; degraded pool states.         |
| `info`  | Startup params, pool discovery results, per-tick price snapshot with all pool prices and opportunity count. |
| `debug` | Per-pool decode details, every arb candidate with spread/impact/optimal-size, AmmConfig values.       |

Sample `info`-level tick log entry (one per polling interval):

```json
{
  "level": "info",
  "message": "Price update",
  "iteration": 4,
  "durationMs": 312,
  "pools": 3,
  "prices": [
    { "pool": "3xAb…7yZ", "spotPrice": 134.81234100, "reserveA": 1820.2000, "feePercent": "0.250" },
    { "pool": "9mNp…2qW", "spotPrice": 134.99812000, "reserveA": 430.5500,  "feePercent": "1.000" },
    { "pool": "7Yba…4dF", "spotPrice": 135.10304500, "reserveA": 2110.7100, "feePercent": "0.250" }
  ],
  "opportunitiesFound": 2,
  "aboveThreshold": 2,
  "timestamp": "2026-04-29T14:02:11.110Z"
}
```

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

## Running Tests

Unit tests cover the core swap simulation math, profit ranking, optimal trade size search, and price impact detection — all without any network calls.

```bash
npm test
```

Expected output:

```
Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
```

**Test files:**

| File | What it tests |
| --- | --- |
| `tests/swap.test.ts` | Constant-product swap math, profit ranking, tx cost deduction, threshold flagging |
| `tests/optimal.test.ts` | Ternary-search optimal size, price impact percentage, HIGH impact flag |

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
- WebSocket-based reserve subscription instead of polling (lower latency than polling).
- Multi-hop arbitrage path search (currently only 2-leg).
- Optional Jupiter / Birdeye price comparison column to cross-check spot prices.
- Telegram / Discord webhook alerts on threshold breach.
- Tx cost in non-SOL tokenA units (currently only deducted for WSOL pairs).

---

## License

MIT — see [LICENSE](LICENSE).

This tool is provided as-is, with no warranty. Trading is risky. Do your own research. The authors are not responsible for any losses incurred from acting on signals this tool produces.
