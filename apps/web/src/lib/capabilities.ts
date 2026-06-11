export type Capability =
  | "marketingSite" | "billing" | "multiTenant" | "selfServeSignup"
  | "oauthLogin" | "autoLogin" | "stdioMcp" | "planEnforcement"
  | "emailVerification" | "managedAiProvider" | "integrations"
  | "inviteCodes" | "semanticSearch" | "dataResidency";

export type Capabilities = Record<Capability, boolean>;
export type Edition = "self_host" | "cloud";

export const EDITION_PRESETS: Record<Edition, Capabilities> = {
  self_host: {
    marketingSite: false, billing: false, multiTenant: false, selfServeSignup: false,
    oauthLogin: false, autoLogin: true, stdioMcp: true, planEnforcement: false,
    emailVerification: false, managedAiProvider: false, integrations: false,
    inviteCodes: false, semanticSearch: false, dataResidency: false,
  },
  cloud: {
    marketingSite: true, billing: true, multiTenant: true, selfServeSignup: true,
    oauthLogin: true, autoLogin: false, stdioMcp: false, planEnforcement: true,
    emailVerification: true, managedAiProvider: true, integrations: true,
    inviteCodes: true, semanticSearch: false, dataResidency: true,
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
