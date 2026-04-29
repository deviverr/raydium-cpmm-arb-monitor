import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { PoolReserves, ArbOpportunity } from './types';
import { bnToNumber, shortAddr } from './price';

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export interface ArbInput {
  reserves: PoolReserves[];
  tradeAmount: number;
  txCostLamports: number;
  mintA: PublicKey;
  minProfitThreshold: number;
}

export function computeArbOpportunities(input: ArbInput): ArbOpportunity[] {
  const { reserves, tradeAmount, txCostLamports, mintA, minProfitThreshold } = input;

  const txCostInInputToken = mintA.toBase58() === WSOL_MINT ? txCostLamports / 1e9 : 0;
  const opps: ArbOpportunity[] = [];

  for (let i = 0; i < reserves.length; i++) {
    for (let j = 0; j < reserves.length; j++) {
      if (i === j) continue;
      const buy = reserves[i];
      const sell = reserves[j];

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

  const priceDiffPercent = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0;

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
  };
}

function bnFeeToFraction(rate: BN, denominator: BN): number {
  return Number(rate.toString()) / Number(denominator.toString());
}
