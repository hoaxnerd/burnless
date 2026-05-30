import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const API = path.resolve(__dirname, "../app/api");
const MUTATING = /export\s+const\s+(POST|PATCH|PUT|DELETE)\b/;

// Routes that intentionally do NOT touch financial compute caches / insights.
const ALLOWLIST = new Set([
  "user-preferences", "dashboard-preferences", "merchant-mappings",
  "integrations", "company", "insights", "auth", "two-factor",
  "ai", "ai-usage", "webhooks", "cron", "health", "export", "privacy",
  "invite-codes", "chat", "feedback", "weekly-digest", "data-room",
  // Non-financial mutation surfaces (auth/admin/AI-config/billing/consent/onboarding
  // bootstrap/export logs/digest). None feed live financial compute caches or the
  // insight badge, so they intentionally skip revalidateTag + trackDataMutation.
  "admin", "ai-features", "billing", "digest", "exports", "onboarding", "users",
]);

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

function isAllowlisted(file: string): boolean {
  const rel = path.relative(API, file);
  const top = rel.split(path.sep)[0]!;
  return ALLOWLIST.has(top);
}

describe("mutation invalidation parity", () => {
  it("every financial mutation route calls BOTH revalidateTag and trackDataMutation", () => {
    const offenders: string[] = [];
    for (const file of routeFiles(API)) {
      if (isAllowlisted(file)) continue;
      const src = readFileSync(file, "utf8");
      if (!MUTATING.test(src)) continue;
      const hasTag = src.includes("revalidateTag");
      const hasTrack = src.includes("trackDataMutation");
      if (!hasTag || !hasTrack) {
        offenders.push(
          `${path.relative(API, file)} — ${hasTag ? "" : "missing revalidateTag "}${hasTrack ? "" : "missing trackDataMutation"}`.trim()
        );
      }
    }
    expect(
      offenders,
      "Financial mutation routes must invalidate caches AND track mutations (both drive live freshness). Fix or allowlist:"
    ).toEqual([]);
  });
});
