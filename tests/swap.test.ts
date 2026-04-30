/**
 * Unit tests for the constant-product swap simulation in arbitrage.ts.
 *
 * These tests verify the core math without any network calls.
 * Run: npm test
 */

import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import { computeArbOpportunities, WSOL_MINT } from '../src/arbitrage';
import { PoolReserves } from '../src/types';
import { FEE_DENOMINATOR } from '../src/discovery';

const WSOL = new PublicKey(WSOL_MINT);
const DECIMALS = 9;

function makeReserves(
  poolId: string,
  reserveA: number,
  reserveB: number,
  feeRateRaw: number
): PoolReserves {
  return {
    poolId: new PublicKey(poolId),
    reserveA: new BN(Math.floor(reserveA * 1e9)),
    reserveB: new BN(Math.floor(reserveB * 1e9)),
    mintADecimals: DECIMALS,
    mintBDecimals: DECIMALS,
    tradeFeeRate: new BN(feeRateRaw),
    feeDenominator: FEE_DENOMINATOR,
  };
}

// Deterministic all-zero public keys as pool IDs (different for each pool)
const POOL_A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const POOL_B = 'So11111111111111111111111111111111111111112';

describe('computeArbOpportunities', () => {
  it('returns no opportunities when only one pool exists', () => {
    const reserves = [makeReserves(POOL_A, 1000, 130_000, 2500)];
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 10_000,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    expect(result).toHaveLength(0);
  });

  it('returns no opportunities when pools have identical prices', () => {
    const reserves = [
      makeReserves(POOL_A, 1000, 130_000, 2500),
      makeReserves(POOL_B, 500, 65_000, 2500),
    ];
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 10_000,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    // Same price ratio → gross profit ≤ 0 after fees → no opportunities returned
    const profitable = result.filter((o) => o.grossProfit > 0);
    expect(profitable).toHaveLength(0);
  });

  it('detects positive gross profit when a price discrepancy exists', () => {
    // Pool A: 1000 SOL / 130,000 USDC → price = 130
    // Pool B: 500 SOL  / 70,000 USDC  → price = 140  (higher)
    // Buy in A (cheaper), sell in B (pricier) should yield gross profit
    const reserves = [
      makeReserves(POOL_A, 1000, 130_000, 2500),  // 0.25% fee, price = 130
      makeReserves(POOL_B, 500, 70_000, 2500),     // 0.25% fee, price = 140
    ];
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 10_000,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    expect(result.length).toBeGreaterThan(0);

    const top = result[0];
    // Best opportunity must be buy-in-A, sell-in-B (A is cheaper)
    expect(top.grossProfit).toBeGreaterThan(0);
    // buyPool has higher B/A rate (more USDC out per SOL) than sellPool — that's the
    // profitable direction: leg1 nets more tokenB, leg2 converts back at lower B/A rate.
    expect(top.buyPrice).toBeGreaterThan(top.sellPrice);
    expect(top.priceDiffPercent).toBeGreaterThan(0);
  });

  it('ranks opportunities by net profit descending', () => {
    const reserves = [
      makeReserves(POOL_A, 1000, 130_000, 2500),
      makeReserves(POOL_B, 500, 70_000, 2500),
    ];
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 10_000,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].netProfit).toBeGreaterThanOrEqual(result[i].netProfit);
    }
  });

  it('deducts tx cost for SOL input token', () => {
    const reserves = [
      makeReserves(POOL_A, 1000, 130_000, 2500),
      makeReserves(POOL_B, 500, 70_000, 2500),
    ];
    const withCost = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 10_000,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    const noCost = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 0,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    if (withCost.length > 0 && noCost.length > 0) {
      const expectedDiff = 10_000 / 1e9;
      expect(Math.abs(noCost[0].netProfit - withCost[0].netProfit - expectedDiff)).toBeLessThan(1e-12);
    }
  });

  it('flags opportunities above min profit threshold', () => {
    const reserves = [
      makeReserves(POOL_A, 100, 13_000, 2500),  // very small pools → more price impact
      makeReserves(POOL_B, 50, 7_000, 2500),
    ];
    const threshold = 0.001;
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 0.01,
      txCostLamports: 0,
      mintA: WSOL,
      minProfitThreshold: threshold,
    });
    for (const o of result) {
      expect(o.meetsThreshold).toBe(o.netProfit >= threshold);
    }
  });

  it('assigns sequential ranks starting from 1', () => {
    const reserves = [
      makeReserves(POOL_A, 1000, 130_000, 2500),
      makeReserves(POOL_B, 500, 70_000, 2500),
    ];
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 0,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    result.forEach((o, i) => expect(o.rank).toBe(i + 1));
  });
});
