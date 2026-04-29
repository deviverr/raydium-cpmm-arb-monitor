import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export interface AmmConfig {
  pubkey: PublicKey;
  index: number;
  tradeFeeRate: BN;
  protocolFeeRate: BN;
  fundFeeRate: BN;
}

export interface CpmmPool {
  poolId: PublicKey;
  ammConfig: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  mintADecimals: number;
  mintBDecimals: number;
  mintProgramA: PublicKey;
  mintProgramB: PublicKey;
}

export interface PoolReserves {
  poolId: PublicKey;
  reserveA: BN;
  reserveB: BN;
  mintADecimals: number;
  mintBDecimals: number;
  tradeFeeRate: BN;
  feeDenominator: BN;
}

export interface PriceSnapshot {
  poolId: string;
  poolIdShort: string;
  spotPrice: number;
  reserveA: number;
  reserveB: number;
  feeRatePercent: number;
  timestamp: number;
}

export interface ArbOpportunity {
  rank: number;
  buyPool: string;
  buyPoolShort: string;
  sellPool: string;
  sellPoolShort: string;
  buyPrice: number;
  sellPrice: number;
  priceDiffPercent: number;
  tradeAmount: number;
  grossProfit: number;
  txCost: number;
  netProfit: number;
  profitable: boolean;
  meetsThreshold: boolean;
}

export interface MonitorContext {
  mintA: PublicKey;
  mintB: PublicKey;
  pools: CpmmPool[];
  configs: Map<string, AmmConfig>;
  startedAt: number;
  iteration: number;
}
