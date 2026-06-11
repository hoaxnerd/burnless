export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // DB must be ready before any request handler runs (fail-fast on error).
    const { initDatabase } = await import("@burnless/db");
    await initDatabase();
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({ dsn, tracesSampleRate: 0.1, environment: process.env.NODE_ENV });
    } catch (e) {
      console.warn("[sentry] Server init skipped:", (e as Error).message);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({ dsn, tracesSampleRate: 0.1, environment: process.env.NODE_ENV });
    } catch (e) {
      console.warn("[sentry] Edge init skipped:", (e as Error).message);
    }
  }
}
