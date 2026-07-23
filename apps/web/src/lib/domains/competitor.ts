/**
 * Competitor domain module (Task 10).
 *
 * Non-core domain: gated by the per-company aiFeatureFlags.features["competitor"]
 * toggle (default on). No deployment capability key required — mirrors company-knowledge.
 *
 * core:false — no `capability` field set; isDomainEnabled falls through to the
 * per-company flag with a default-on behaviour, consistent with company-knowledge.
 *
 * mcpExclude omitted → list_competitors / list_competitor_changes are MCP-exposed too
 * (both are read-only and safe to surface via MCP).
 *
 * NOTE: the financial naming guard (tools-naming.test.ts) only iterates
 * getFinancialTools(), so these list_* tools are not covered by it. If that guard
 * is ever extended to domain tools, add list_competitors / list_competitor_changes
 * to CONTROL_TOOLS (same bucket as list_accounts).
 */

import type {
  ContextContributor,
  ContextSection,
  ContributeCtx,
} from "@burnless/ai";
import { listChanges } from "@burnless/db";
import { competitorTools, competitorHandlers } from "@/lib/ai-tools/competitor";
import type { DomainModule, DomainNavEntry } from "./contracts";

const DOMAIN = "competitor";

// ── Context contributor ────────────────────────────────────────────────────────

export const competitorContributor: ContextContributor = {
  id: "competitor-recent-changes",
  domain: DOMAIN,
  async sections(ctx: ContributeCtx): Promise<ContextSection[]> {
    try {
      const rows = await listChanges(ctx.companyId, { limit: 10 });
      if (rows.length === 0) return [];
      const body = rows
        .map((r) => `- ${r.summary}`)
        .join("\n");
      return [{ heading: "Recent competitor changes", body, order: 40 }];
    } catch {
      // Graceful degradation: a read failure must never break the turn.
      return [];
    }
  },
};

// ── Nav entries ────────────────────────────────────────────────────────────────

/** Backend nav entry: icon as Lucide component name string (sidebar maps to component). */
export const competitorNavEntries: DomainNavEntry[] = [
  {
    id: "competitors",
    href: "/competitors",
    label: "Competitors",
    icon: "Swords",
  },
];

// ── Domain module ──────────────────────────────────────────────────────────────

export const competitorDomainModule: DomainModule = {
  id: DOMAIN,
  // non-core: gated by per-company toggle (aiFeatureFlags.features["competitor"]),
  // default on. No `capability` key — same pattern as company-knowledge.
  tools: competitorTools, // ← surfaces list_competitors + list_competitor_changes to the LLM
  handlers: competitorHandlers,
  contextContributors: [competitorContributor],
  promptSections: [],
  navEntries: competitorNavEntries,
  // mcpExclude omitted → both read tools are exposed over MCP.
};
