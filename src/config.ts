import * as dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';

dotenv.config();

export interface AppConfig {
  rpcEndpoint: string;
  pollingIntervalMs: number;
  minProfitThreshold: number;
  tradeAmount: number;
  txCostLamports: number;
  logLevel: string;
  logFile: string;
}

export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'
);

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v;
}

function envNumber(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number for ${key}: ${raw}`);
  }
  return n;
}

export function loadConfig(): AppConfig {
  const cfg: AppConfig = {
    rpcEndpoint: requireEnv('RPC_ENDPOINT'),
    pollingIntervalMs: envNumber('POLLING_INTERVAL_MS', 5000),
    minProfitThreshold: envNumber('MIN_PROFIT_THRESHOLD', 0.0001),
    tradeAmount: envNumber('TRADE_AMOUNT', 1),
    txCostLamports: envNumber('TX_COST_LAMPORTS', 10000),
    logLevel: process.env.LOG_LEVEL?.trim() || 'info',
    logFile: process.env.LOG_FILE?.trim() || 'arb-monitor.log',
  };

  if (cfg.pollingIntervalMs < 500) {
    throw new Error('POLLING_INTERVAL_MS must be >= 500 to avoid RPC rate limits');
  }
  if (cfg.tradeAmount <= 0) {
    throw new Error('TRADE_AMOUNT must be > 0');
  }

  return cfg;
}

export function parseMintArgs(argv: string[]): { mintA: PublicKey; mintB: PublicKey } {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (argv.length < 2) {
    printHelp();
    process.exit(1);
  }

  try {
    return {
      mintA: new PublicKey(argv[0]),
      mintB: new PublicKey(argv[1]),
    };
  } catch (e) {
    console.error(`Error: invalid mint address — ${(e as Error).message}\n`);
    printHelp();
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
raydium-cpmm-arb-monitor  v0.1.0
Real-time arbitrage monitoring tool for Raydium CPMM pools on Solana.

Usage:
  npm run dev -- <mintA> <mintB>
  node dist/index.js <mintA> <mintB>
  node dist/index.js --help

Arguments:
  mintA    SPL token mint address — input/output token of the simulated arbitrage
  mintB    SPL token mint address — intermediate token

Common pairs:
  SOL/USDC    So11111111111111111111111111111111111111112
              EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

  POPCAT/SOL  7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr
              So11111111111111111111111111111111111111112

  WIF/SOL     EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm
              So11111111111111111111111111111111111111112

  JUP/SOL     JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
              So11111111111111111111111111111111111111112

Configuration (.env):
  RPC_ENDPOINT           Solana RPC endpoint  [required — Helius recommended]
  POLLING_INTERVAL_MS    Refresh interval ms  [default: 5000, min: 500]
  MIN_PROFIT_THRESHOLD   Min net profit to flag green  [default: 0.0001]
  TRADE_AMOUNT           Notional trade size in mintA units  [default: 1]
  TX_COST_LAMPORTS       Estimated 2-leg arb tx cost in lamports  [default: 10000]
  LOG_LEVEL              info | warn | error | debug  [default: info]
  LOG_FILE               Log file path  [default: arb-monitor.log]

Run tests:
  npm test

See README.md for full documentation.
`);
}
