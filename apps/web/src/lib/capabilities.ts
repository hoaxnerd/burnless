import { NextResponse } from "next/server";

export type Capability =
  | "marketingSite" | "billing" | "multiTenant" | "selfServeSignup"
  | "oauthLogin" | "autoLogin" | "stdioMcp" | "planEnforcement"
  | "emailVerification" | "managedAiProvider" | "integrations"
  | "inviteCodes" | "semanticSearch" | "dataResidency"
  | "skills";

export type Capabilities = Record<Capability, boolean>;
export type Edition = "self_host" | "cloud";

export const EDITION_PRESETS: Record<Edition, Capabilities> = {
  self_host: {
    marketingSite: false, billing: false, multiTenant: false, selfServeSignup: false,
    oauthLogin: false, autoLogin: true, stdioMcp: true, planEnforcement: false,
    emailVerification: false, managedAiProvider: false, integrations: false,
    inviteCodes: false, semanticSearch: false, dataResidency: false,
    // Filesystem-backed; cloud/DB-backed skills are a later consumer.
    skills: true,
  },
  cloud: {
    marketingSite: true, billing: true, multiTenant: true, selfServeSignup: true,
    oauthLogin: true, autoLogin: false, stdioMcp: false, planEnforcement: true,
    emailVerification: true, managedAiProvider: true, integrations: true,
    // semanticSearch ON for cloud (managed 1536-dim embedder). Self-host stays false:
    // its default Ollama embedder is 768-dim, incompatible with the vector(1536) column —
    // operators enable it via BURNLESS_CAP_SEMANTIC_SEARCH=true once a 1536-dim embedder is set.
    inviteCodes: true, semanticSearch: true, dataResidency: true,
    // Filesystem-backed; cloud/DB-backed skills are a later consumer.
    skills: false,
  },
};

const CAP_ENV: Record<Capability, string> = {
  marketingSite: "BURNLESS_CAP_MARKETING_SITE",
  billing: "BURNLESS_CAP_BILLING",
  multiTenant: "BURNLESS_CAP_MULTI_TENANT",
  selfServeSignup: "BURNLESS_CAP_SELF_SERVE_SIGNUP",
  oauthLogin: "BURNLESS_CAP_OAUTH_LOGIN",
  autoLogin: "BURNLESS_CAP_AUTO_LOGIN",
  stdioMcp: "BURNLESS_CAP_STDIO_MCP",
  planEnforcement: "BURNLESS_CAP_PLAN_ENFORCEMENT",
  emailVerification: "BURNLESS_CAP_EMAIL_VERIFICATION",
  managedAiProvider: "BURNLESS_CAP_MANAGED_AI_PROVIDER",
  integrations: "BURNLESS_CAP_INTEGRATIONS",
  inviteCodes: "BURNLESS_CAP_INVITE_CODES",
  semanticSearch: "BURNLESS_CAP_SEMANTIC_SEARCH",
  dataResidency: "BURNLESS_CAP_DATA_RESIDENCY",
  skills: "BURNLESS_CAP_SKILLS",
};

function envFlag(name: string): boolean | undefined {
  const v = process.env[name];
  if (v == null || v === "") return undefined;
  const s = v.toLowerCase();
  if (["on", "true", "1", "yes"].includes(s)) return true;
  if (["off", "false", "0", "no"].includes(s)) return false;
  return undefined;
}

function hasPaymentProvider(): boolean {
  return !!process.env.STRIPE_SECRET_KEY ||
    !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
function hasManagedAiKey(): boolean {
  return !!(process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}
function hasOAuth(): boolean {
  return !!(process.env.AUTH_GITHUB_ID || process.env.AUTH_GOOGLE_ID);
}
function hasEmailProvider(): boolean {
  return !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST || process.env.EMAIL_PROVIDER);
}

export function getEdition(): Edition {
  return process.env.BURNLESS_DEPLOYMENT === "cloud" ? "cloud" : "self_host";
}

export function getCapabilities(): Capabilities {
  const base: Capabilities = { ...EDITION_PRESETS[getEdition()] };
  for (const cap of Object.keys(base) as Capability[]) {
    const override = envFlag(CAP_ENV[cap]);
    if (override !== undefined) base[cap] = override;
  }
  // Back-compat: legacy env that predates BURNLESS_CAP_STDIO_MCP.
  if (process.env.BURNLESS_ALLOW_STDIO_MCP === "false") base.stdioMcp = false;
  // auto-degrade: capabilities that need credentials/runtime cannot be forced on
  if (!hasPaymentProvider()) base.billing = false;
  if (!hasManagedAiKey()) base.managedAiProvider = false;
  if (!hasOAuth()) base.oauthLogin = false;
  if (!hasEmailProvider()) base.emailVerification = false;
  if (getEdition() === "cloud") base.stdioMcp = false; // hard rule, cannot override up
  return base;
}

export function requireCapability(cap: Capability): NextResponse | null {
  if (getCapabilities()[cap]) return null;
  return NextResponse.json(
    { error: `This feature is not available on this deployment`, code: "CAPABILITY_DISABLED", capability: cap },
    { status: 403 }
  );
}

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
  return envFlag(envKey);
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
  // Lazy import to avoid circular dep (domains/registry.ts → capabilities.ts → domains/registry.ts).
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
