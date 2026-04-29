#!/usr/bin/env node
import { Connection } from '@solana/web3.js';
import { loadConfig, parseMintArgs } from './config';
import { initLogger, getLogger, silenceConsole, unsilenceConsole } from './logger';
import { discoverPools, fetchAmmConfigs } from './discovery';
import { fetchPoolReserves, reservesToSnapshots } from './price';
import { computeArbOpportunities } from './arbitrage';
import { render, clearScreen } from './display';
import { MonitorContext, PriceSnapshot, ArbOpportunity } from './types';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = initLogger({ level: config.logLevel, file: config.logFile });

  logger.info('raydium-cpmm-arb-monitor starting', {
    rpcEndpoint: redactRpc(config.rpcEndpoint),
    pollingIntervalMs: config.pollingIntervalMs,
    minProfitThreshold: config.minProfitThreshold,
    tradeAmount: config.tradeAmount,
    txCostLamports: config.txCostLamports,
    logLevel: config.logLevel,
    logFile: config.logFile,
  });

  let mints;
  try {
    mints = parseMintArgs(process.argv.slice(2));
  } catch (e) {
    logger.error((e as Error).message);
    process.exit(1);
  }

  const connection = new Connection(config.rpcEndpoint, 'confirmed');

  let pools;
  try {
    pools = await discoverPools(connection, mints.mintA, mints.mintB);
  } catch (e) {
    logger.error('Pool discovery failed', { error: (e as Error).message });
    process.exit(1);
  }

  if (pools.length < 2) {
    logger.warn(
      `Found only ${pools.length} pool(s). At least 2 pools are required for arbitrage. Continuing anyway — display will show pool prices.`
    );
  }

  const configs = await fetchAmmConfigs(connection, pools);

  const ctx: MonitorContext = {
    mintA: mints.mintA,
    mintB: mints.mintB,
    pools,
    configs,
    startedAt: Date.now(),
    iteration: 0,
  };

  let lastPrices: PriceSnapshot[] = [];
  let lastOpps: ArbOpportunity[] = [];
  let lastError: string | undefined;

  // Switch console logger off; the TUI owns stdout from here on.
  silenceConsole();

  const handleShutdown = (signal: string) => {
    unsilenceConsole();
    clearScreen();
    logger.info(`Received ${signal}, shutting down`);
    process.exit(0);
  };
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  const tick = async (): Promise<void> => {
    ctx.iteration += 1;
    const startedTick = Date.now();
    try {
      const reserves = await fetchPoolReserves(connection, pools, configs);
      lastPrices = reservesToSnapshots(reserves);

      lastOpps = computeArbOpportunities({
        reserves,
        tradeAmount: config.tradeAmount,
        txCostLamports: config.txCostLamports,
        mintA: mints.mintA,
        minProfitThreshold: config.minProfitThreshold,
      });

      const profitable = lastOpps.filter((o) => o.meetsThreshold);
      logger.debug('Tick complete', {
        iteration: ctx.iteration,
        durationMs: Date.now() - startedTick,
        pools: pools.length,
        opps: lastOpps.length,
        opportunitiesAboveThreshold: profitable.length,
      });
      if (profitable.length > 0) {
        const top = profitable[0];
        logger.warn('Arbitrage opportunity above threshold', {
          rank: top.rank,
          buyPool: top.buyPool,
          sellPool: top.sellPool,
          buyPrice: top.buyPrice,
          sellPrice: top.sellPrice,
          priceDiffPercent: top.priceDiffPercent,
          netProfit: top.netProfit,
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
      rpcEndpoint: redactRpc(config.rpcEndpoint),
      pollingIntervalMs: config.pollingIntervalMs,
      tradeAmount: config.tradeAmount,
      minProfitThreshold: config.minProfitThreshold,
      lastUpdate: Date.now(),
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
  // Logger may not be ready; print and exit.
  console.error('Fatal error:', e);
  process.exit(1);
});
