/**
 * Environment variable validation — fail fast on missing required config.
 *
 * Import this module early (it validates on first import).
 * All env var access in the app should go through this module.
 *
 * Required vars throw at import time in production.
 * Optional vars return undefined gracefully.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // In development or during build, warn but don't crash
    if (process.env.NODE_ENV === "development" || process.env.NEXT_PHASE === "phase-production-build") {
      console.warn(`[env] Missing required env var: ${name}`);
      return "";
    }
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in your .env file or deployment config.`
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

// ── Server-side environment ─────────────────────────────────────────────────

export const env = {
  /** Node environment */
  NODE_ENV: process.env.NODE_ENV ?? "development",
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",

  // ── Database ────────────────────────────────────────────────────────────
  /** PostgreSQL connection string. Required at runtime (lazy to avoid build-time errors). */
  get DATABASE_URL(): string {
    return required("DATABASE_URL");
  },

  // ── Auth ────────────────────────────────────────────────────────────────
  /** NextAuth secret for JWT signing. Required at runtime (lazy to avoid build-time errors). */
  get AUTH_SECRET(): string {
    return required("AUTH_SECRET");
  },
  /** GitHub OAuth (optional — social login) */
  AUTH_GITHUB_ID: optional("AUTH_GITHUB_ID"),
  AUTH_GITHUB_SECRET: optional("AUTH_GITHUB_SECRET"),
  /** Google OAuth (optional — social login) */
  AUTH_GOOGLE_ID: optional("AUTH_GOOGLE_ID"),
  AUTH_GOOGLE_SECRET: optional("AUTH_GOOGLE_SECRET"),

  // ── AI ──────────────────────────────────────────────────────────────────
  /** AI provider name: anthropic, openai, openrouter, etc. */
  AI_PROVIDER: optional("AI_PROVIDER"),
  /** AI model ID override */
  AI_MODEL: optional("AI_MODEL"),
  /** Generic AI API key (takes precedence over provider-specific keys) */
  AI_API_KEY: optional("AI_API_KEY"),
  /** Custom base URL for AI provider */
  AI_BASE_URL: optional("AI_BASE_URL"),
  /** Legacy: Anthropic API key */
  ANTHROPIC_API_KEY: optional("ANTHROPIC_API_KEY"),
  /** Legacy: OpenAI API key */
  OPENAI_API_KEY: optional("OPENAI_API_KEY"),

  /** Whether any AI provider is configured */
  get hasAiProvider(): boolean {
    return !!(this.AI_API_KEY || this.ANTHROPIC_API_KEY || this.OPENAI_API_KEY);
  },

  // ── Billing ─────────────────────────────────────────────────────────────
  /** Stripe secret key (optional — billing features disabled without it) */
  STRIPE_SECRET_KEY: optional("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: optional("STRIPE_WEBHOOK_SECRET"),
  STRIPE_PRO_PRICE_ID: optional("STRIPE_PRO_PRICE_ID"),
  STRIPE_TEAM_PRICE_ID: optional("STRIPE_TEAM_PRICE_ID"),

  /** Whether Stripe is configured */
  get hasStripe(): boolean {
    return !!this.STRIPE_SECRET_KEY;
  },

  // ── Monitoring ─────────────────────────────────────────────────────────
  /** Sentry DSN for error monitoring (public — safe to expose in client bundles) */
  SENTRY_DSN: optional("NEXT_PUBLIC_SENTRY_DSN"),

  // ── App ─────────────────────────────────────────────────────────────────
  /** Public app URL — used for Stripe redirects, emails, etc. */
  get APP_URL(): string {
    const url = process.env.NEXT_PUBLIC_APP_URL;
    if (url) return url;
    if (this.isProd) {
      console.warn("[env] NEXT_PUBLIC_APP_URL not set in production — using fallback");
    }
    return "http://localhost:3000";
  },
} as const;
