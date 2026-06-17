export const CLI_VERSION = "0.2.0";

/**
 * Display version with optional build metadata injected at packaging time
 * (BURNLESS_BUILD_SHA / BURNLESS_BUILD_DATE). Falls back to the bare version in dev.
 */
export function versionString(env: NodeJS.ProcessEnv = process.env): string {
  const parts = [env.BURNLESS_BUILD_SHA?.trim(), env.BURNLESS_BUILD_DATE?.trim()].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return parts.length > 0 ? `${CLI_VERSION} (${parts.join(", ")})` : CLI_VERSION;
}
