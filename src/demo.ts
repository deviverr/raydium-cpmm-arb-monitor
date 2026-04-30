import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { PoolReserves, CpmmPool, AmmConfig, MonitorContext } from './types';
import { FEE_DENOMINATOR } from './discovery';

// Synthetic mint addresses used only in demo mode (SOL + USDC for realistic display)
export const DEMO_MINT_A = new PublicKey('So11111111111111111111111111111111111111112');
export const DEMO_MINT_B = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Fake pool pubkeys (deterministic, on-curve, for display only)
const DEMO_POOL_A = new PublicKey('DemoAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1111');
const DEMO_POOL_B = new PublicKey('DemoBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2222');
const DEMO_POOL_C = new PublicKey('DemoCcccccccccccccccccccccccccccccccccc3333');

function makeReserves(
  poolId: PublicKey,
  solAmount: number,
  usdcAmount: number,
  feeRateRaw: number
): PoolReserves {
  return {
    poolId,
    reserveA: new BN(Math.floor(solAmount * 1e9)),
    reserveB: new BN(Math.floor(usdcAmount * 1e6)),
    mintADecimals: 9,
    mintBDecimals: 6,
    tradeFeeRate: new BN(feeRateRaw),
    feeDenominator: FEE_DENOMINATOR,
  };
}

/**
 * Three synthetic CPMM pools with a clear price spread so the TUI always
 * shows profitable arbitrage opportunities without any RPC calls.
 *
 * Pool A: 1 000 SOL / 130 000 USDC → price = 130.0  (cheapest)  fee = 0.25%
 * Pool B:   420 SOL /  57 540 USDC → price = 137.0  (middle)    fee = 0.25%
 * Pool C:    85 SOL /  12 155 USDC → price = 143.0  (priciest)  fee = 1.00%
 *
 * Best arb: buy SOL (spend USDC) in Pool A, sell SOL for USDC in Pool C.
 * Spread: (143 - 130) / 130 ≈ 10% before fees.
 */
export function getDemoReserves(): PoolReserves[] {
  return [
    makeReserves(DEMO_POOL_A, 1000,  130_000, 2500),   // 0.25% fee, price = 130
    makeReserves(DEMO_POOL_B,  420,   57_540, 2500),   // 0.25% fee, price = 137
    makeReserves(DEMO_POOL_C,   85,   12_155, 10_000), // 1.00% fee, price = 143
  ];
}

export function getDemoContext(): MonitorContext {
  const fakeCpmmPool = (poolId: PublicKey): CpmmPool => ({
    poolId,
    ammConfig: PublicKey.default,
    vaultA: PublicKey.default,
    vaultB: PublicKey.default,
    mintA: DEMO_MINT_A,
    mintB: DEMO_MINT_B,
    mintADecimals: 9,
    mintBDecimals: 6,
    mintProgramA: PublicKey.default,
    mintProgramB: PublicKey.default,
  });

  return {
    mintA: DEMO_MINT_A,
    mintB: DEMO_MINT_B,
    pools: [DEMO_POOL_A, DEMO_POOL_B, DEMO_POOL_C].map(fakeCpmmPool),
    configs: new Map<string, AmmConfig>(),
    startedAt: Date.now(),
    iteration: 0,
    demo: true,
  };
}
