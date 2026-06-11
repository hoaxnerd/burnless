export type Dialect = "postgres" | "pglite";

/**
 * Whether to auto-migrate on boot. See spec §5.
 * Explicit BURNLESS_AUTO_MIGRATE wins (only the literal "true" enables);
 * otherwise default is on for pglite, off for postgres.
 */
export function shouldAutoMigrate(dialect: Dialect, env: NodeJS.ProcessEnv): boolean {
  const raw = env.BURNLESS_AUTO_MIGRATE;
  if (typeof raw === "string" && raw.length > 0) return raw === "true";
  return dialect === "pglite";
}
