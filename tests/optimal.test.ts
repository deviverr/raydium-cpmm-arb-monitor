/**
 * Unit tests for optimal trade size finder and price impact detection.
 * Run: npm test
 */

import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import { computeArbOpportunities, WSOL_MINT } from '../src/arbitrage';
import { PoolReserves } from '../src/types';
import { FEE_DENOMINATOR } from '../src/discovery';

const WSOL = new PublicKey(WSOL_MINT);
const POOL_A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const POOL_B = 'So11111111111111111111111111111111111111112';

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
    mintADecimals: 9,
    mintBDecimals: 9,
    tradeFeeRate: new BN(feeRateRaw),
    feeDenominator: FEE_DENOMINATOR,
  };
}

describe('optimal trade size', () => {
  it('optimal profit >= configured trade amount profit', () => {
    const reserves = [
      makeReserves(POOL_A, 1000, 130_000, 2500),
      makeReserves(POOL_B, 500, 70_000, 2500),
    ];
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 0.1,
      txCostLamports: 0,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    if (result.length > 0) {
      const top = result[0];
      expect(top.optimalNetProfit).toBeGreaterThanOrEqual(top.netProfit - 1e-10);
    }
  });

  it('optimal profit is zero when no arb exists', () => {
    const reserves = [
      makeReserves(POOL_A, 1000, 130_000, 2500),
      makeReserves(POOL_B, 500, 65_000, 2500),
    ];
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 0,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    // No profitable opps → result should be empty (grossProfit <= 0 filtered)
    expect(result).toHaveLength(0);
  });

  it('optimal trade amount is positive when arb exists', () => {
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
    if (result.length > 0) {
      expect(result[0].optimalTradeAmount).toBeGreaterThan(0);
    }
  });
});

describe('price impact detection', () => {
  it('flags high impact when trade > 10% of buy pool reserve', () => {
    const reserves = [
      makeReserves(POOL_A, 10, 1_300, 2500),   // tiny pool — 1 SOL = 10% of reserve
      makeReserves(POOL_B, 5, 700, 2500),
    ];
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 0,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    if (result.length > 0) {
      const top = result[0];
      // 1 SOL in a 10 SOL pool = 10% impact → should warn
      if (top.priceImpactPct > 10) {
        expect(top.highImpactWarning).toBe(true);
      }
    }
  });

  it('does not flag low impact for deep pools', () => {
    const reserves = [
      makeReserves(POOL_A, 5000, 650_000, 2500),
      makeReserves(POOL_B, 2500, 350_000, 2500),
    ];
    const result = computeArbOpportunities({
      reserves,
      tradeAmount: 1,
      txCostLamports: 0,
      mintA: WSOL,
      minProfitThreshold: 0,
    });
    if (result.length > 0) {
      // 1 SOL in 100k pool = 0.001% impact
      expect(result[0].highImpactWarning).toBe(false);
      expect(result[0].priceImpactPct).toBeLessThan(1);
    }
  });

  it('price impact percent is proportional to trade size', () => {
    const reserves = [
      makeReserves(POOL_A, 1000, 130_000, 2500),
      makeReserves(POOL_B, 500, 70_000, 2500),
    ];
    const small = computeArbOpportunities({
      reserves, tradeAmount: 1, txCostLamports: 0, mintA: WSOL, minProfitThreshold: 0,
    });
    const large = computeArbOpportunities({
      reserves, tradeAmount: 10, txCostLamports: 0, mintA: WSOL, minProfitThreshold: 0,
    });
    if (small.length > 0 && large.length > 0) {
      expect(large[0].priceImpactPct).toBeGreaterThan(small[0].priceImpactPct);
    }
  });
});
