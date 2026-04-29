import winston from 'winston';

let loggerInstance: winston.Logger | null = null;
let consoleSilenced = false;

export interface LoggerOptions {
  level: string;
  file: string;
}

export function initLogger(opts: LoggerOptions): winston.Logger {
  const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()} ${message}${metaStr}`;
    })
  );

  loggerInstance = winston.createLogger({
    level: opts.level,
    transports: [
      new winston.transports.File({
        filename: opts.file,
        format: fileFormat,
      }),
      new winston.transports.Console({
        format: consoleFormat,
        silent: false,
      }),
    ],
  });

  return loggerInstance;
}

export function silenceConsole(): void {
  if (!loggerInstance) return;
  consoleSilenced = true;
  for (const t of loggerInstance.transports) {
    if (t instanceof winston.transports.Console) {
      t.silent = true;
    }
  }
}

export function unsilenceConsole(): void {
  if (!loggerInstance) return;
  consoleSilenced = false;
  for (const t of loggerInstance.transports) {
    if (t instanceof winston.transports.Console) {
      t.silent = false;
    }
  }
}

export function isConsoleSilenced(): boolean {
  return consoleSilenced;
}

export function getLogger(): winston.Logger {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call initLogger() first.');
  }
  return loggerInstance;
}
