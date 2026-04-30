import chalk from 'chalk';
import Table from 'cli-table3';
import { PriceSnapshot, ArbOpportunity, MonitorContext } from './types';

export interface RenderInput {
  ctx: MonitorContext;
  prices: PriceSnapshot[];
  opportunities: ArbOpportunity[];
  rpcEndpoint: string;
  pollingIntervalMs: number;
  tradeAmount: number;
  minProfitThreshold: number;
  minReserveA: number;
  lastUpdate: number;
  tickMs: number;
  errorMsg?: string;
}

export function clearScreen(): void {
  process.stdout.write('\x1Bc');
}

export function render(input: RenderInput): void {
  const {
    ctx,
    prices,
    opportunities,
    rpcEndpoint,
    pollingIntervalMs,
    tradeAmount,
    minProfitThreshold,
    minReserveA,
    lastUpdate,
    tickMs,
    errorMsg,
  } = input;

  clearScreen();

  const elapsed = Math.floor((Date.now() - ctx.startedAt) / 1000);
  const updatedStr = new Date(lastUpdate).toISOString().replace('T', ' ').replace(/\..+/, '');
  const demoTag = ctx.demo ? chalk.cyan.bold('[DEMO] ') : '';
  const rpcDisplay = ctx.demo ? chalk.cyan('demo mode — no RPC required') : truncate(rpcEndpoint, 55);

  console.log(
    demoTag +
    chalk.bold.cyan('Raydium CPMM Arbitrage Monitor  ') +
      chalk.dim(`v0.1.0  iteration #${ctx.iteration}  uptime ${elapsed}s  scan ${tickMs}ms`)
  );
  console.log(
    chalk.dim(`  Pair: ${shortPub(ctx.mintA.toBase58())} / ${shortPub(ctx.mintB.toBase58())}`) +
      chalk.dim(`   Pools: ${ctx.pools.length}   Updated: ${updatedStr}`)
  );
  console.log(
    chalk.dim(`  Polling: ${pollingIntervalMs}ms   Trade size: ${tradeAmount}   Min profit: ${minProfitThreshold}   Min reserve: ${minReserveA}`)
  );
  console.log(chalk.dim(`  RPC: ${rpcDisplay}`));
  console.log('');

  if (errorMsg) {
    console.log(chalk.red.bold(`  ERROR: ${errorMsg}`));
    console.log('');
  }

  renderPriceTable(prices, minReserveA);
  console.log('');
  renderArbTable(opportunities, minProfitThreshold);
  console.log('');
  console.log(chalk.dim('  Ctrl+C to exit. Logs streamed to file (see LOG_FILE).'));
}

function renderPriceTable(prices: PriceSnapshot[], minReserveA: number): void {
  console.log(chalk.bold('  Pool Prices'));
  if (prices.length === 0) {
    console.log(chalk.yellow('  No pool prices available.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold('Pool'),
      chalk.bold('Spot Price (B per A)'),
      chalk.bold('Reserve A'),
      chalk.bold('Reserve B'),
      chalk.bold('Liq.'),
      chalk.bold('Fee'),
    ],
    style: { head: [], border: ['gray'] },
    chars: cleanBorder(),
  });

  const sorted = [...prices].sort((a, b) => a.spotPrice - b.spotPrice);
  for (const p of sorted) {
    const lowLiq = p.reserveA < 0.1;
    const excluded = p.excludedFromArb;
    const liqLabel = excluded
      ? chalk.red('LOW') + chalk.dim(' excl')
      : lowLiq
      ? chalk.red('LOW')
      : chalk.green('OK');
    const dimRow = excluded || lowLiq;
    const row = [
      dimRow ? chalk.dim(p.poolIdShort) : p.poolIdShort,
      dimRow ? chalk.dim(formatPrice(p.spotPrice)) : formatPrice(p.spotPrice),
      formatNum(p.reserveA),
      formatNum(p.reserveB),
      liqLabel,
      `${p.feeRatePercent.toFixed(3)}%`,
    ];
    table.push(row);
  }
  console.log(table.toString());
  const excluded = prices.filter((p) => p.excludedFromArb).length;
  if (excluded > 0) {
    console.log(chalk.dim(`  ${excluded} pool(s) excluded from arb (reserveA < ${minReserveA}). Price shown for reference only.`));
  }
}

function renderArbTable(opps: ArbOpportunity[], threshold: number): void {
  console.log(chalk.bold('  Arbitrage Opportunities (ranked by net profit)'));

  if (opps.length === 0) {
    console.log(chalk.yellow('  No profitable arbitrage detected (after fees).'));
    console.log(chalk.dim('  → On liquid pairs (SOL/USDC), MEV bots close spreads in <100ms.'));
    console.log(chalk.dim('  → Try newly-launched or low-liquidity CPMM pairs for real opportunities.'));
    console.log(chalk.dim('  → Run with --demo to see sample output with simulated opportunities.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold('#'),
      chalk.bold('Buy Pool'),
      chalk.bold('Sell Pool'),
      chalk.bold('Spread %'),
      chalk.bold('Impact'),
      chalk.bold('Net Profit'),
      chalk.bold('Optimal Size'),
      chalk.bold('Optimal Profit'),
    ],
    style: { head: [], border: ['gray'] },
    chars: cleanBorder(),
  });

  const top = opps.slice(0, 10);
  for (const o of top) {
    const colorize = o.meetsThreshold
      ? chalk.green
      : o.netProfit > 0
      ? chalk.yellow
      : chalk.gray;
    const impactStr = o.highImpactWarning
      ? chalk.red(`${o.priceImpactPct.toFixed(1)}% ⚠`)
      : chalk.dim(`${o.priceImpactPct.toFixed(1)}%`);
    const optProfit = o.optimalNetProfit > 0
      ? chalk.cyan(formatProfit(o.optimalNetProfit))
      : chalk.dim('—');
    const optSize = o.optimalTradeAmount > 0
      ? chalk.dim(formatNum(o.optimalTradeAmount))
      : chalk.dim('—');
    table.push([
      colorize(String(o.rank)),
      colorize(o.buyPoolShort),
      colorize(o.sellPoolShort),
      colorize(`${o.priceDiffPercent.toFixed(4)}%`),
      impactStr,
      colorize(formatProfit(o.netProfit)),
      optSize,
      optProfit,
    ]);
  }
  console.log(table.toString());
  const aboveThreshold = opps.filter((o) => o.meetsThreshold).length;
  const withWarning = opps.filter((o) => o.highImpactWarning).length;
  let summary = `  ${opps.length} opportunit${opps.length === 1 ? 'y' : 'ies'} found, ${aboveThreshold} above threshold (${threshold})`;
  if (withWarning > 0) summary += chalk.red(`  ${withWarning} high price-impact ⚠`);
  console.log(chalk.dim(summary));
}

function shortPub(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

function formatPrice(p: number): string {
  if (p === 0) return '0';
  if (p < 0.0001) return p.toExponential(4);
  if (p < 1) return p.toFixed(8);
  if (p < 1000) return p.toFixed(6);
  return p.toFixed(2);
}

function formatNum(n: number): string {
  if (n === 0) return '0';
  if (n < 0.01) return n.toExponential(2);
  if (n < 1000) return n.toFixed(4);
  if (n < 1_000_000) return n.toFixed(2);
  return (n / 1_000_000).toFixed(2) + 'M';
}

function formatProfit(n: number): string {
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) < 1e-8) return '0.00000000';
  return `${sign}${n.toFixed(8)}`;
}

function cleanBorder() {
  return {
    top: '─',
    'top-mid': '┬',
    'top-left': '┌',
    'top-right': '┐',
    bottom: '─',
    'bottom-mid': '┴',
    'bottom-left': '└',
    'bottom-right': '┘',
    left: '│',
    'left-mid': '├',
    mid: '─',
    'mid-mid': '┼',
    right: '│',
    'right-mid': '┤',
    middle: '│',
  };
}
