export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // DB must be ready before any request handler runs (fail-fast on error).
    const { initDatabase } = await import("@burnless/db");
    await initDatabase();

    // S4a — first-run: create the single local user (no-op on cloud / when a
    // user already exists). NON-fatal: the /api/auth/auto-login route re-runs
    // ensureLocalUser defensively, so a missed boot creation self-heals.
    try {
      const { ensureLocalUser } = await import("@/lib/local-auth");
      await ensureLocalUser();
    } catch (e) {
      console.warn("[s4a] ensureLocalUser at boot skipped:", (e as Error).message);
    }

    // S3a — start the in-process scheduler driver (self_host). No-op under the
    // external driver (cloud / Docker+sidecar). Non-fatal.
    try {
      const { startInProcessScheduler } = await import("@/lib/scheduler/driver");
      startInProcessScheduler();
    } catch (e) {
      console.warn("[s3a] scheduler boot skipped:", (e as Error).message);
    }
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
