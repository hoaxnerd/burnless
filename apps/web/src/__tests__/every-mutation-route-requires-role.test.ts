import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * GUARD [AUTHZ-01]: Every business-data mutation route (POST/PUT/PATCH/DELETE)
 * that gates on `requireCompanyAccess()` MUST also assert write authority via
 * `requireRole(...)` (or a future `requireCompanyWrite(...)` primitive).
 *
 * Why: `requireCompanyAccess()` returns ANY membership role — it proves tenancy,
 * NOT write authority. A mutation that omits the follow-up `requireRole` lets a
 * viewer-role member create/modify real financial data.
 *
 * RED NOW: api/transactions, api/merchant-mappings, api/exports mutate via
 * `requireCompanyAccess` only. When each adds a role gate, this turns GREEN.
 *
 * Mirrors apps/web/src/__tests__/no-hardcoded-currency.test.ts (recursive walk +
 * regex + small justified ALLOWLIST + offenders printed in the assertion).
 */

const API_DIR = path.resolve(import.meta.dirname, "../app/api");

/**
 * Route path prefixes (relative to app/api/) that are exempt from the role gate.
 * Each entry MUST justify WHY. Never allowlist a current business-data offender.
 */
const ALLOWED_PREFIXES: { match: string; why: string }[] = [
  { match: "auth/", why: "Auth endpoints (register/login/2FA/verify) — pre-membership, gated by their own logic." },
  { match: "webhooks/", why: "Provider webhooks — authenticated by signature/secret, not by member role." },
  { match: "cron/", why: "Cron jobs — authenticated by CRON_SECRET bearer, no user session." },
  { match: "health/", why: "Health check — public, read-only." },
];

/**
 * Exact route paths (relative to app/api/) that mutate ONLY self-scoped / per-user
 * preferences or per-company AI config/cache — defensibly role-free per AUTHZ-01.
 * Never add a business-data write route here.
 */
const ALLOWED_EXACT: { match: string; why: string }[] = [
  { match: "dashboard-preferences/route.ts", why: "Writes per-user dashboard layout prefs." },
  { match: "user-preferences/route.ts", why: "Writes per-user preferences." },
  { match: "users/me/route.ts", why: "Self profile mutation (the caller's own user row)." },
  { match: "auth/change-password/route.ts", why: "Self-scoped per-user password change — gates on session (getAuthUser), not company role. Also covered by the auth/ prefix." },
  { match: "users/me/consent/route.ts", why: "Self privacy-consent mutation." },
  { match: "ai/permissions/route.ts", why: "Per-company AI permission grants (AI-config, not financial data)." },
  { match: "insights/route.ts", why: "AI insight cache (regenerate/cache write), not business data." },
  { match: "insights/batch-regenerate/route.ts", why: "AI insight cache batch regenerate." },
  { match: "digest/route.ts", why: "Weekly-digest trigger/preference, not business data." },
  { match: "chat/route.ts", why: "AI chat — conversation/usage scoped, separate write-mode gating in the AI layer." },
  { match: "chat/resume/route.ts", why: "AI chat resume — conversation scoped." },
  { match: "chat/reset-grants/route.ts", why: "AI chat grant reset — conversation scoped." },
  { match: "onboarding/route.ts", why: "Onboarding bootstrap for the caller's own brand-new company." },
  { match: "onboarding/enrich/route.ts", why: "Onboarding AI enrichment (no persistence of others' data)." },
  { match: "tokens/route.ts", why: "PAT mint: any member may mint (expose spec §5.1); write authority enforced per-scope via roleScopeCap (viewer → read-only). Self-scoped credential." },
  { match: "tokens/[id]/route.ts", why: "PAT revoke: userId-scoped — revokes only the caller's own token." },
];

const MUTATION_EXPORT = /export\s+(?:const|async\s+function)\s+(POST|PUT|PATCH|DELETE)\b/;
const ROLE_GATE = /requireRole\s*\(|requireCompanyWrite\s*\(/;
const ACCESS_GATE = /requireCompanyAccess\s*\(/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

function isAllowed(rel: string): boolean {
  return (
    ALLOWED_PREFIXES.some((p) => rel.startsWith(p.match)) ||
    ALLOWED_EXACT.some((e) => rel === e.match)
  );
}

describe("every mutation route requires a write-role gate (AUTHZ-01)", () => {
  it("no business-data mutation handler relies on requireCompanyAccess alone", () => {
    const files = walk(API_DIR);
    const offenders: string[] = [];

    for (const file of files) {
      const rel = path.relative(API_DIR, file).split(path.sep).join("/");
      if (isAllowed(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (!MUTATION_EXPORT.test(src)) continue; // no mutating handler
      if (!ACCESS_GATE.test(src)) continue; // not company-scoped (public/other)
      if (ROLE_GATE.test(src)) continue; // properly gated
      offenders.push(`apps/web/src/app/api/${rel}`);
    }

    expect(
      offenders,
      `Mutation routes gated by requireCompanyAccess WITHOUT requireRole/requireCompanyWrite ` +
        `— ${offenders.length} found:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
