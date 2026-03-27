/**
 * Structured logger powered by Pino.
 *
 * - Production: JSON output for log aggregation (Datadog, Loki, CloudWatch)
 * - Development: pretty-printed, colorized output
 * - Log level: configurable via LOG_LEVEL env var (default: "info" prod, "debug" dev)
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   const log = logger("webhook");
 *   log.error("payment failed:", err);
 *   log.info({ companyId, plan }, "subscription updated");
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const level =
  process.env.LOG_LEVEL ?? (isDev ? "debug" : "info");

const rootLogger = pino({ level });

export interface Logger {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

/**
 * Adapt variadic args (our existing API) to Pino's (obj?, msg) signature.
 *
 * Supports these calling patterns (all used in the codebase):
 *   log.error("message")
 *   log.error("message:", error)
 *   log.error({ companyId }, "message")
 */
function toPino(args: unknown[]): [Record<string, unknown>, string] {
  if (args.length === 0) return [{}, ""];

  // Single Error
  if (args.length === 1 && args[0] instanceof Error) {
    return [{ err: args[0] }, args[0].message];
  }

  // Single string
  if (args.length === 1 && typeof args[0] === "string") {
    return [{}, args[0]];
  }

  // First arg is an object (not Error) — treat as structured context
  if (
    args.length >= 1 &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    !(args[0] instanceof Error)
  ) {
    const [obj, ...rest] = args;
    return [
      obj as Record<string, unknown>,
      rest.map(String).join(" "),
    ];
  }

  // Common pattern: "message:", errorOrValue
  // Separate string parts from Error objects
  const strings: string[] = [];
  const ctx: Record<string, unknown> = {};

  for (const arg of args) {
    if (arg instanceof Error) {
      ctx.err = arg;
      strings.push(arg.message);
    } else {
      strings.push(String(arg));
    }
  }

  return [ctx, strings.join(" ")];
}

export function logger(module: string): Logger {
  const child = rootLogger.child({ module });

  return {
    error: (...args) => {
      const [obj, msg] = toPino(args);
      child.error(obj, msg);
    },
    warn: (...args) => {
      const [obj, msg] = toPino(args);
      child.warn(obj, msg);
    },
    info: (...args) => {
      const [obj, msg] = toPino(args);
      child.info(obj, msg);
    },
    debug: (...args) => {
      const [obj, msg] = toPino(args);
      child.debug(obj, msg);
    },
  };
}
