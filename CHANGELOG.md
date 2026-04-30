# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] — 2026-05-01

### Added
- **Optimal trade size** — ternary search (40 iterations) finds the profit-maximizing input amount for each candidate pool pair. Shown as `Optimal Size` and `Optimal Profit` columns in the TUI.
- **Price impact detection** — flags opportunities where `TRADE_AMOUNT > 10%` of the buy pool's tokenA reserve with a red `⚠` in the `Impact` column. Summary line counts flagged candidates.
- **Scan duration in header** — TUI header now shows `scan Xms`, the RPC round-trip time for each tick.
- **`--help` / `-h` flag** — prints full usage with common mint pairs, configuration reference, and test instructions. Bad arguments now show help instead of crashing with a stack trace.
- **Per-opportunity debug logging** — every arb candidate logged at `debug` level with spread %, price impact %, optimal size, and threshold flag.
- **`tests/optimal.test.ts`** — 6 new unit tests for optimal trade size and price impact detection (13 total across 2 test files, all passing).

### Changed
- `priceDiffPercent` is now a positive value representing the spread `(buyPrice - sellPrice) / sellPrice × 100`. Previously it was computed as `(sellPrice - buyPrice) / buyPrice`, which yielded a negative value for profitable opportunities.
- TUI arb table columns updated: removed `Buy Price`, `Sell Price`, `Gross`, `Tx Cost`; added `Spread %`, `Impact`, `Optimal Size`, `Optimal Profit`. Net Profit retained.
- Price update now logged at `info` level every tick (previously `debug`-only), so structured logs show regular activity at the default log level.

---

## [1.0.0] — 2026-04-30

### Added
- On-chain CPMM pool discovery via `getProgramAccounts` with memcmp filters on pool state layout (offset 168 for mintA, 200 for mintB). Searches both mint orderings, deduplicates by pool pubkey.
- Per-pool fee tier from on-chain `AmmConfig` accounts, fetched in batch via `getMultipleAccountsInfo`.
- Constant-product 2-leg swap simulation with explicit fee accounting on both legs.
- Decimal-adjusted spot price calculation: `reserveB / 10^decimalsB / (reserveA / 10^decimalsA)`.
- Liquidity health indicator (LOW / OK) per pool in the price table, based on `reserveA < 0.1` threshold.
- Live-updating TUI using `chalk` + `cli-table3` with color-coded profit tiers (green / yellow / gray).
- Structured JSON logging via `winston` — file transport (all levels) + console (suppressed during TUI render).
- Fully configurable via `.env`: RPC endpoint, polling interval, trade amount, min profit threshold, tx cost, log level, log file.
- MIT license, comprehensive README with architecture diagram, math explanation, and config reference.
- `tests/` harness with ready-to-run shell scripts for SOL/USDC, POPCAT/SOL, WIF/SOL, JUP/SOL pairs.
- `tests/swap.test.ts` — 7 unit tests for swap math, ranking, tx cost, and threshold logic.
