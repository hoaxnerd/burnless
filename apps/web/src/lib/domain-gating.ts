import { NextResponse } from "next/server";

import { getCapabilities, type Capability } from "./capabilities";

// ── Domain-level switch (A3a-2) ─────────────────────────────────────────────

/**
 * Per-domain deployment capability overrides.
 * Key = domain id (e.g. "finance"). Value = deployment-level default (true = enabled).
 * Env var: BURNLESS_DOMAIN_<UPPER_ID>=on|off.
 * Defaults to true (opt-in — new domains are on until an operator turns them off).
 */
const CAP_DOMAIN: Record<string, string> = {
  finance: "BURNLESS_DOMAIN_FINANCE",
  // Add more domain env vars here as new domains are introduced.
};

function domainEnvFlag(domainId: string): boolean | undefined {
  const envKey = CAP_DOMAIN[domainId];
  if (!envKey) return undefined;
  const v = process.env[envKey];
  if (v == null || v === "") return undefined;
  const s = v.toLowerCase();
  if (["on", "true", "1", "yes"].includes(s)) return true;
  if (["off", "false", "0", "no"].includes(s)) return false;
  return undefined;
}

/**
 * Check whether a domain is enabled for the given context.
 *
 * Evaluation order:
 * 1. core domains (e.g. finance) → always true, no DB read.
 * 2. Deployment capability (CAP_DOMAIN env override, default true if absent).
 * 3. Per-company toggle from aiFeatureFlags.features[domainId] (default true if absent).
 *
 * `companyId` is optional — if absent, per-company toggle is skipped (treated as enabled).
 * Callers must pass companyId when a real company context is available.
 */
export async function isDomainEnabled(
  domainId: string,
  opts: { companyId?: string },
): Promise<boolean> {
  // Lazy import to avoid circular dep (domains/registry.ts → domain-gating.ts → domains/registry.ts).
  // The registry exports the singleton; we only need .getAll() to check core flag.
  const { domainRegistry } = await import("@/lib/domains/registry");
  const mod = domainRegistry.getAll().find((m) => m.id === domainId);

  // 1. Core domains are always enabled.
  if (mod?.core) return true;

  // 1b. Deployment capability gate — if the module declares a `capability` and that
  //     capability is explicitly off in the current edition/env, block the domain.
  //     Only affects modules that declare `capability`; existing domains (finance=core,
  //     company-knowledge/memory with no capability) are unaffected.
  if (mod?.capability && getCapabilities()[mod.capability as Capability] === false) return false;

  // 2. Deployment-level capability check.
  const deploymentEnabled = domainEnvFlag(domainId) ?? true;
  if (!deploymentEnabled) return false;

  // 3. Per-company toggle (skip when no companyId is available).
  if (!opts.companyId) return true;

  const { getAiFlags } = await import("@/lib/ai-feature-flags");
  const flags = await getAiFlags(opts.companyId);
  // Default-on: a domain is enabled unless its key is explicitly `false`.
  return flags.features[domainId] !== false;
}

/**
 * Guard for API routes: returns a 403 NextResponse if the domain is disabled,
 * or null if it is enabled. Mirrors requireCapability.
 */
export async function requireDomainEnabled(
  domainId: string,
  opts: { companyId?: string },
): Promise<NextResponse | null> {
  const enabled = await isDomainEnabled(domainId, opts);
  if (enabled) return null;
  return NextResponse.json(
    { error: "This domain is not available on this deployment", code: "DOMAIN_DISABLED", domainId },
    { status: 403 },
  );
}
