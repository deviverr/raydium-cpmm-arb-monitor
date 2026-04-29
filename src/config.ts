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
  if (argv.length < 2) {
    throw new Error(
      'Usage: raydium-arb-monitor <mintA> <mintB>\n' +
        'Example: raydium-arb-monitor So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    );
  }
  try {
    return {
      mintA: new PublicKey(argv[0]),
      mintB: new PublicKey(argv[1]),
    };
  } catch (e) {
    throw new Error(`Invalid mint address: ${(e as Error).message}`);
  }
}
