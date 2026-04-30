import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { PoolReserves, ArbOpportunity } from './types';
import { bnToNumber, shortAddr } from './price';

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const HIGH_IMPACT_THRESHOLD = 0.1; // warn if trade > 10% of buy-pool reserve
const OPTIMAL_SEARCH_STEPS = 40;   // ternary search iterations

export interface ArbInput {
  reserves: PoolReserves[];
  tradeAmount: number;
  txCostLamports: number;
  mintA: PublicKey;
  minProfitThreshold: number;
  minReserveA: number;
}

export function computeArbOpportunities(input: ArbInput): ArbOpportunity[] {
  const { reserves, tradeAmount, txCostLamports, mintA, minProfitThreshold, minReserveA } = input;

  const txCostInInputToken = mintA.toBase58() === WSOL_MINT ? txCostLamports / 1e9 : 0;

  // Filter out dust pools from arb simulation — they produce garbage profit estimates.
  const eligible = reserves.filter(
    (r) => bnToNumber(r.reserveA, r.mintADecimals) >= minReserveA
  );

  const opps: ArbOpportunity[] = [];

  for (let i = 0; i < eligible.length; i++) {
    for (let j = 0; j < eligible.length; j++) {
      if (i === j) continue;
      const buy = eligible[i];
      const sell = eligible[j];

      const opp = simulateArb(buy, sell, tradeAmount, txCostInInputToken);
      if (opp.grossProfit <= 0) continue;
      opps.push(opp);
    }
  }

  opps.sort((a, b) => b.netProfit - a.netProfit);
  opps.forEach((o, idx) => {
    o.rank = idx + 1;
    o.meetsThreshold = o.netProfit >= minProfitThreshold;
  });

  return opps;
}

function simulateArb(
  buyPool: PoolReserves,
  sellPool: PoolReserves,
  tradeAmountInputToken: number,
  txCostInputToken: number
): ArbOpportunity {
  const buyId = buyPool.poolId.toBase58();
  const sellId = sellPool.poolId.toBase58();

  const buyResA = bnToNumber(buyPool.reserveA, buyPool.mintADecimals);
  const buyResB = bnToNumber(buyPool.reserveB, buyPool.mintBDecimals);
  const sellResA = bnToNumber(sellPool.reserveA, sellPool.mintADecimals);
  const sellResB = bnToNumber(sellPool.reserveB, sellPool.mintBDecimals);

  const buyPrice = buyResA > 0 ? buyResB / buyResA : 0;
  const sellPrice = sellResA > 0 ? sellResB / sellResA : 0;

  const buyFeeFraction = bnFeeToFraction(buyPool.tradeFeeRate, buyPool.feeDenominator);
  const sellFeeFraction = bnFeeToFraction(sellPool.tradeFeeRate, sellPool.feeDenominator);

  // Leg 1: spend tradeAmount of tokenA in buyPool to receive tokenB
  const amountInAfterFee1 = tradeAmountInputToken * (1 - buyFeeFraction);
  const amountOutB =
    buyResA + amountInAfterFee1 > 0
      ? (buyResB * amountInAfterFee1) / (buyResA + amountInAfterFee1)
      : 0;

  // Leg 2: spend amountOutB of tokenB in sellPool to receive tokenA
  const amountInAfterFee2 = amountOutB * (1 - sellFeeFraction);
  const amountOutA =
    sellResB + amountInAfterFee2 > 0
      ? (sellResA * amountInAfterFee2) / (sellResB + amountInAfterFee2)
      : 0;

  const grossProfit = amountOutA - tradeAmountInputToken;
  const netProfit = grossProfit - txCostInputToken;

  // Price spread: buyPool B/A > sellPool B/A means profitable. Positive = good.
  const priceDiffPercent =
    sellPrice > 0 ? ((buyPrice - sellPrice) / sellPrice) * 100 : 0;

  // Price impact: how much of the buy-pool's reserve the trade consumes.
  const priceImpactPct = buyResA > 0 ? (tradeAmountInputToken / buyResA) * 100 : 0;
  const highImpactWarning = priceImpactPct > HIGH_IMPACT_THRESHOLD * 100;

  // Optimal trade size: ternary search for argmax(netProfit) over [0, 30% of min reserve]
  const maxSearch = Math.min(buyResA, sellResA) * 0.3;
  const { optimalAmount, optimalProfit } = findOptimalTradeSize(
    buyResA, buyResB, sellResA, sellResB,
    buyFeeFraction, sellFeeFraction,
    txCostInputToken, maxSearch
  );

  return {
    rank: 0,
    buyPool: buyId,
    buyPoolShort: shortAddr(buyId),
    sellPool: sellId,
    sellPoolShort: shortAddr(sellId),
    buyPrice,
    sellPrice,
    priceDiffPercent,
    tradeAmount: tradeAmountInputToken,
    grossProfit,
    txCost: txCostInputToken,
    netProfit,
    profitable: netProfit > 0,
    meetsThreshold: false,
    priceImpactPct,
    highImpactWarning,
    optimalTradeAmount: optimalAmount,
    optimalNetProfit: optimalProfit,
  };
}

function swapNetProfit(
  x: number,
  buyResA: number, buyResB: number,
  sellResA: number, sellResB: number,
  buyFee: number, sellFee: number,
  txCost: number
): number {
  const inAfterFee1 = x * (1 - buyFee);
  const outB = buyResA + inAfterFee1 > 0
    ? (buyResB * inAfterFee1) / (buyResA + inAfterFee1)
    : 0;
  const inAfterFee2 = outB * (1 - sellFee);
  const outA = sellResB + inAfterFee2 > 0
    ? (sellResA * inAfterFee2) / (sellResB + inAfterFee2)
    : 0;
  return outA - x - txCost;
}

function findOptimalTradeSize(
  buyResA: number, buyResB: number,
  sellResA: number, sellResB: number,
  buyFee: number, sellFee: number,
  txCost: number,
  maxSize: number
): { optimalAmount: number; optimalProfit: number } {
  if (maxSize <= 0) return { optimalAmount: 0, optimalProfit: 0 };

  // Ternary search on a concave profit function
  let lo = 0;
  let hi = maxSize;
  for (let i = 0; i < OPTIMAL_SEARCH_STEPS; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const p1 = swapNetProfit(m1, buyResA, buyResB, sellResA, sellResB, buyFee, sellFee, txCost);
    const p2 = swapNetProfit(m2, buyResA, buyResB, sellResA, sellResB, buyFee, sellFee, txCost);
    if (p1 < p2) {
      lo = m1;
    } else {
      hi = m2;
    }
  }

  const optimalAmount = (lo + hi) / 2;
  const optimalProfit = swapNetProfit(
    optimalAmount, buyResA, buyResB, sellResA, sellResB, buyFee, sellFee, txCost
  );

  return {
    optimalAmount: optimalProfit > 0 ? optimalAmount : 0,
    optimalProfit: Math.max(0, optimalProfit),
  };
}

function bnFeeToFraction(rate: BN, denominator: BN): number {
  return Number(rate.toString()) / Number(denominator.toString());
}
