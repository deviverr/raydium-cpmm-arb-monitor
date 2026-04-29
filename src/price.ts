import { Connection, PublicKey } from '@solana/web3.js';
import { AccountLayout } from '@solana/spl-token';
import BN from 'bn.js';
import { CpmmPool, AmmConfig, PoolReserves, PriceSnapshot } from './types';
import { getLogger } from './logger';
import { FEE_DENOMINATOR, feeRateToPercent } from './discovery';

export async function fetchPoolReserves(
  connection: Connection,
  pools: CpmmPool[],
  configs: Map<string, AmmConfig>
): Promise<PoolReserves[]> {
  const log = getLogger();

  if (pools.length === 0) return [];

  const vaultPubkeys: PublicKey[] = [];
  for (const p of pools) {
    vaultPubkeys.push(p.vaultA, p.vaultB);
  }

  const accountInfos = await connection.getMultipleAccountsInfo(vaultPubkeys, 'confirmed');
  const reserves: PoolReserves[] = [];

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const vaultAInfo = accountInfos[2 * i];
    const vaultBInfo = accountInfos[2 * i + 1];

    if (!vaultAInfo || !vaultBInfo) {
      log.warn('Pool vault account missing', {
        poolId: pool.poolId.toBase58(),
        vaultA: pool.vaultA.toBase58(),
        vaultB: pool.vaultB.toBase58(),
      });
      continue;
    }

    const cfg = configs.get(pool.ammConfig.toBase58());
    if (!cfg) {
      log.warn('AmmConfig not loaded for pool, skipping', {
        poolId: pool.poolId.toBase58(),
        ammConfig: pool.ammConfig.toBase58(),
      });
      continue;
    }

    try {
      const accA = AccountLayout.decode(vaultAInfo.data);
      const accB = AccountLayout.decode(vaultBInfo.data);

      reserves.push({
        poolId: pool.poolId,
        reserveA: new BN(accA.amount.toString()),
        reserveB: new BN(accB.amount.toString()),
        mintADecimals: pool.mintADecimals,
        mintBDecimals: pool.mintBDecimals,
        tradeFeeRate: cfg.tradeFeeRate,
        feeDenominator: FEE_DENOMINATOR,
      });
    } catch (e) {
      log.warn('Failed to decode vault account', {
        poolId: pool.poolId.toBase58(),
        error: (e as Error).message,
      });
    }
  }

  return reserves;
}

export function computeSpotPrice(reserves: PoolReserves): number {
  const a = bnToNumber(reserves.reserveA, reserves.mintADecimals);
  const b = bnToNumber(reserves.reserveB, reserves.mintBDecimals);
  if (a === 0) return 0;
  return b / a;
}

export function bnToNumber(bn: BN, decimals: number): number {
  const divisor = Math.pow(10, decimals);
  // Handle large BN safely by splitting into integer/fractional via toString
  return Number(bn.toString()) / divisor;
}

export function reservesToSnapshots(reserves: PoolReserves[]): PriceSnapshot[] {
  const now = Date.now();
  return reserves.map((r) => {
    const id = r.poolId.toBase58();
    return {
      poolId: id,
      poolIdShort: shortAddr(id),
      spotPrice: computeSpotPrice(r),
      reserveA: bnToNumber(r.reserveA, r.mintADecimals),
      reserveB: bnToNumber(r.reserveB, r.mintBDecimals),
      feeRatePercent: feeRateToPercent(r.tradeFeeRate),
      timestamp: now,
    };
  });
}

export function shortAddr(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
