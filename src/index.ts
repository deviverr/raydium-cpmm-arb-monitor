#!/usr/bin/env node
// Suppress native-binding load warnings (e.g. bigint-buffer fallback) before any imports.
process.env['NODE_NO_WARNINGS'] = '1';

import { Connection } from '@solana/web3.js';
import { loadConfig, parseMintArgs } from './config';
import { initLogger, getLogger, silenceConsole, unsilenceConsole } from './logger';
import { discoverPools, fetchAmmConfigs } from './discovery';
import { fetchPoolReserves, reservesToSnapshots } from './price';
import { computeArbOpportunities } from './arbitrage';
import { render, clearScreen } from './display';
import { MonitorContext, PriceSnapshot, ArbOpportunity } from './types';
import { getDemoReserves, getDemoContext } from './demo';

async function main(): Promise<void> {
  const args = parseMintArgs(process.argv.slice(2));
  const config = loadConfig(args.demo);

  const logger = initLogger({ level: config.logLevel, file: config.logFile });

  if (args.demo) {
    logger.info('raydium-cpmm-arb-monitor starting in demo mode', {
      pollingIntervalMs: config.pollingIntervalMs,
      tradeAmount: config.tradeAmount,
      minReserveA: config.minReserveA,
    });
  } else {
    logger.info('raydium-cpmm-arb-monitor starting', {
      rpcEndpoint: redactRpc(config.rpcEndpoint),
      pollingIntervalMs: config.pollingIntervalMs,
      minProfitThreshold: config.minProfitThreshold,
      tradeAmount: config.tradeAmount,
      txCostLamports: config.txCostLamports,
      minReserveA: config.minReserveA,
      logLevel: config.logLevel,
      logFile: config.logFile,
    });
  }

  let ctx: MonitorContext;
  let demoReserves: ReturnType<typeof getDemoReserves> | null = null;

  if (args.demo) {
    ctx = getDemoContext();
    demoReserves = getDemoReserves();
    logger.info('Demo pools loaded', { pools: ctx.pools.length });
  } else {
    const connection = new Connection(config.rpcEndpoint, 'confirmed');

    let pools;
    try {
      pools = await discoverPools(connection, args.mintA, args.mintB);
    } catch (e) {
      logger.error('Pool discovery failed', { error: (e as Error).message });
      process.exit(1);
    }

    if (pools.length < 2) {
      logger.warn(
        `Found only ${pools.length} pool(s). At least 2 pools required for arbitrage. Continuing — display will show pool prices.`
      );
    }

    const configs = await fetchAmmConfigs(connection, pools);

    ctx = {
      mintA: args.mintA,
      mintB: args.mintB,
      pools,
      configs,
      startedAt: Date.now(),
      iteration: 0,
      demo: false,
    };
  }

  let lastPrices: PriceSnapshot[] = [];
  let lastOpps: ArbOpportunity[] = [];
  let lastTickMs = 0;
  let lastError: string | undefined;

  silenceConsole();

  const handleShutdown = (signal: string) => {
    unsilenceConsole();
    clearScreen();
    logger.info(`Received ${signal}, shutting down`);
    process.exit(0);
  };
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  const connection = args.demo ? null : new Connection(config.rpcEndpoint, 'confirmed');

  const tick = async (): Promise<void> => {
    ctx.iteration += 1;
    const startedTick = Date.now();
    try {
      const reserves = args.demo
        ? demoReserves!
        : await fetchPoolReserves(connection!, ctx.pools, ctx.configs);

      lastPrices = reservesToSnapshots(reserves, config.minReserveA);

      lastOpps = computeArbOpportunities({
        reserves,
        tradeAmount: config.tradeAmount,
        txCostLamports: config.txCostLamports,
        mintA: args.mintA,
        minProfitThreshold: config.minProfitThreshold,
        minReserveA: config.minReserveA,
      });

      const profitable = lastOpps.filter((o) => o.meetsThreshold);
      lastTickMs = Date.now() - startedTick;

      logger.info('Price update', {
        iteration: ctx.iteration,
        durationMs: lastTickMs,
        pools: lastPrices.length,
        prices: lastPrices.map((p) => ({
          pool: p.poolIdShort,
          spotPrice: Number(p.spotPrice.toFixed(8)),
          reserveA: Number(p.reserveA.toFixed(4)),
          reserveB: Number(p.reserveB.toFixed(4)),
          feePercent: p.feeRatePercent.toFixed(3),
          excludedFromArb: p.excludedFromArb,
        })),
        opportunitiesFound: lastOpps.length,
        aboveThreshold: profitable.length,
      });
      lastOpps.forEach((o) => {
        logger.debug('Arb candidate', {
          rank: o.rank,
          buyPool: o.buyPool,
          sellPool: o.sellPool,
          spread: `${o.priceDiffPercent.toFixed(4)}%`,
          priceImpact: `${o.priceImpactPct.toFixed(2)}%`,
          highImpact: o.highImpactWarning,
          netProfit: o.netProfit,
          optimalTradeAmount: o.optimalTradeAmount,
          optimalNetProfit: o.optimalNetProfit,
          meetsThreshold: o.meetsThreshold,
        });
      });
      if (profitable.length > 0) {
        const top = profitable[0];
        logger.warn('Arbitrage opportunity above threshold', {
          rank: top.rank,
          buyPool: top.buyPool,
          sellPool: top.sellPool,
          priceDiffPercent: top.priceDiffPercent,
          netProfit: top.netProfit,
          optimalNetProfit: top.optimalNetProfit,
          tradeAmount: top.tradeAmount,
        });
      }
      lastError = undefined;
    } catch (e) {
      lastError = (e as Error).message;
      logger.error('Tick failed', { error: lastError });
    }

    render({
      ctx,
      prices: lastPrices,
      opportunities: lastOpps,
      rpcEndpoint: args.demo ? 'demo' : redactRpc(config.rpcEndpoint),
      pollingIntervalMs: config.pollingIntervalMs,
      tradeAmount: config.tradeAmount,
      minProfitThreshold: config.minProfitThreshold,
      minReserveA: config.minReserveA,
      lastUpdate: Date.now(),
      tickMs: lastTickMs,
      errorMsg: lastError,
    });
  };

  await tick();
  setInterval(tick, config.pollingIntervalMs);
}

function redactRpc(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has('api-key')) {
      u.searchParams.set('api-key', '***');
    }
    return u.toString();
  } catch {
    return url;
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
