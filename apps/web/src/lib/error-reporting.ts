/**
 * Centralized error reporting. Currently a no-op stub.
 *
 * When Sentry is configured (SENTRY_DSN set), this module will be wired up
 * via instrumentation.ts which already initializes Sentry server-side.
 *
 * Client-side error capture will be added when withSentryConfig() is properly
 * integrated into next.config.ts (requires Sentry auth token + project setup).
 *
 * Until then, errors are logged to console and caught by error boundaries.
 */

export function captureException(error: unknown): void {
  // In development, errors are already logged by Next.js error overlay
  if (process.env.NODE_ENV === "production") {
    console.error("[error-reporting]", error);
  }
}

export function setUser(_user: { id: string; email?: string }): void {
  // No-op until Sentry is configured
}

export function setTag(_key: string, _value: string): void {
  // No-op until Sentry is configured
}
