export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("../sentry.server.config");
    } catch (e) {
      // Sentry init may fail if pages-manifest.json is missing (app-router-only project)
      console.warn("[sentry] Server init skipped:", (e as Error).message);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    try {
      await import("../sentry.edge.config");
    } catch (e) {
      console.warn("[sentry] Edge init skipped:", (e as Error).message);
    }
  }
}
