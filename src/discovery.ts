import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { CpmmPoolInfoLayout, CpmmConfigInfoLayout } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './config';
import { getLogger } from './logger';
import { CpmmPool, AmmConfig } from './types';

const MINT_A_OFFSET = 168;
const MINT_B_OFFSET = 200;

export const FEE_DENOMINATOR = new BN(1_000_000);

async function fetchPoolsByMintOrder(
  connection: Connection,
  mintFirst: PublicKey,
  mintSecond: PublicKey
): Promise<readonly { pubkey: PublicKey; account: AccountInfo<Buffer> }[]> {
  return connection.getProgramAccounts(RAYDIUM_CPMM_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      { dataSize: CpmmPoolInfoLayout.span },
      { memcmp: { offset: MINT_A_OFFSET, bytes: mintFirst.toBase58() } },
      { memcmp: { offset: MINT_B_OFFSET, bytes: mintSecond.toBase58() } },
    ],
  });
}

export async function discoverPools(
  connection: Connection,
  mintA: PublicKey,
  mintB: PublicKey
): Promise<CpmmPool[]> {
  const log = getLogger();
  log.info('Discovering CPMM pools', {
    mintA: mintA.toBase58(),
    mintB: mintB.toBase58(),
    program: RAYDIUM_CPMM_PROGRAM_ID.toBase58(),
  });

  const [orderForward, orderReverse] = await Promise.all([
    fetchPoolsByMintOrder(connection, mintA, mintB),
    fetchPoolsByMintOrder(connection, mintB, mintA),
  ]);

  const seen = new Set<string>();
  const pools: CpmmPool[] = [];

  for (const raw of [...orderForward, ...orderReverse]) {
    const id = raw.pubkey.toBase58();
    if (seen.has(id)) continue;
    seen.add(id);

    try {
      const decoded = CpmmPoolInfoLayout.decode(raw.account.data);
      pools.push({
        poolId: raw.pubkey,
        ammConfig: decoded.configId,
        vaultA: decoded.vaultA,
        vaultB: decoded.vaultB,
        mintA: decoded.mintA,
        mintB: decoded.mintB,
        mintADecimals: decoded.mintDecimalA,
        mintBDecimals: decoded.mintDecimalB,
        mintProgramA: decoded.mintProgramA,
        mintProgramB: decoded.mintProgramB,
      });
      log.debug('Pool decoded', {
        poolId: id,
        ammConfig: decoded.configId.toBase58(),
        mintA: decoded.mintA.toBase58(),
        mintB: decoded.mintB.toBase58(),
      });
    } catch (e) {
      log.warn('Failed to decode pool account', {
        poolId: id,
        error: (e as Error).message,
      });
    }
  }

  log.info(`Pool discovery complete: found ${pools.length} pool(s)`, {
    poolIds: pools.map((p) => p.poolId.toBase58()),
  });
  return pools;
}

export async function fetchAmmConfigs(
  connection: Connection,
  pools: CpmmPool[]
): Promise<Map<string, AmmConfig>> {
  const log = getLogger();
  const uniqueConfigs = Array.from(
    new Map(pools.map((p) => [p.ammConfig.toBase58(), p.ammConfig])).values()
  );

  if (uniqueConfigs.length === 0) {
    return new Map();
  }

  const accountInfos = await connection.getMultipleAccountsInfo(uniqueConfigs, 'confirmed');
  const result = new Map<string, AmmConfig>();

  for (let i = 0; i < uniqueConfigs.length; i++) {
    const cfgKey = uniqueConfigs[i];
    const info = accountInfos[i];
    if (!info) {
      log.warn('AmmConfig account not found', { config: cfgKey.toBase58() });
      continue;
    }
    try {
      const decoded = CpmmConfigInfoLayout.decode(info.data);
      result.set(cfgKey.toBase58(), {
        pubkey: cfgKey,
        index: decoded.index,
        tradeFeeRate: decoded.tradeFeeRate,
        protocolFeeRate: decoded.protocolFeeRate,
        fundFeeRate: decoded.fundFeeRate,
      });
      log.debug('AmmConfig decoded', {
        config: cfgKey.toBase58(),
        tradeFeeRate: decoded.tradeFeeRate.toString(),
        feePercent: feeRateToPercent(decoded.tradeFeeRate),
      });
    } catch (e) {
      log.warn('Failed to decode AmmConfig', {
        config: cfgKey.toBase58(),
        error: (e as Error).message,
      });
    }
  }

  return result;
}

export function feeRateToPercent(rate: BN): number {
  return rate.toNumber() / Number(FEE_DENOMINATOR.toString()) * 100;
}
