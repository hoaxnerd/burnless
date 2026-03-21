/**
 * Structured logger — thin wrapper over console in dev.
 * Swap the transport for Sentry / Axiom / Datadog in production
 * by changing the `transport` implementation below.
 */

type LogPayload = unknown[];

interface Transport {
  error(module: string, ...args: LogPayload): void;
  warn(module: string, ...args: LogPayload): void;
  info(module: string, ...args: LogPayload): void;
}

const consoleTransport: Transport = {
  error: (mod, ...args) => console.error(`[${mod}]`, ...args),
  warn: (mod, ...args) => console.warn(`[${mod}]`, ...args),
  info: (mod, ...args) => console.log(`[${mod}]`, ...args),
};

// Single place to swap transports (e.g. Sentry in prod)
const transport: Transport = consoleTransport;

export interface Logger {
  error(...args: LogPayload): void;
  warn(...args: LogPayload): void;
  info(...args: LogPayload): void;
}

export function logger(module: string): Logger {
  return {
    error: (...args) => transport.error(module, ...args),
    warn: (...args) => transport.warn(module, ...args),
    info: (...args) => transport.info(module, ...args),
  };
}
