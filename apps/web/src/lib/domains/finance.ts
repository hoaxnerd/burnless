/**
 * Finance domain module — the core (always-on) domain for Burnless.
 *
 * Bundles: all financial tools, tool handlers, the finance context contributor,
 * the core nav entries (icon as string name), and MCP exclusion logic.
 *
 * finance is core:true → isDomainEnabled returns true without a DB read.
 *
 * A3a-2: DORMANT for chat/MCP/scheduler — getActive* returns the same set as
 * today's getFinancialTools() / getMcpExposedTools(). Parity proven by tests.
 * A3a-3 will wire the registry output into the consumers.
 */

import {
  getFinancialTools,
  MCP_SERVER_EXCLUDED_TOOLS,
  DEFAULT_CONTEXT_HEADING,
  type ContextContributor,
  type ContextSection,
} from "@burnless/ai";
import { toolHandlers } from "@/lib/ai-tools/index";
import { buildAiContext } from "@/lib/build-ai-context";
import { coreNavItems } from "@/app/(dashboard)/dashboard-shell/nav-config";
import type { DomainModule, DomainNavEntry } from "./contracts";
import type { ContributeCtx } from "@burnless/ai";

// ── Finance context contributor ──────────────────────────────────────────────

/**
 * Produces the financial snapshot context section for the system message.
 *
 * NOTE (A3a-2): The scenario-override prefix handling (currently done in the
 * chat route before calling buildAiContext) is intentionally NOT moved here.
 * A3a-3 will decide whether to move it into the contributor or keep it at the
 * call site. For now, the contributor calls buildAiContext with the scenario
 * from ctx (which may be the baseline scenario) — same as today.
 */
export const financeContributor: ContextContributor = {
  id: "finance-snapshot",
  domain: "finance",
  async sections(ctx: ContributeCtx): Promise<ContextSection[]> {
    const scenario = {
      id: ctx.scenarioId ?? "base",
      name: "Baseline",
      source: "base",
    };
    const { contextText } = await buildAiContext(ctx.companyId, scenario);
    return [
      {
        heading: DEFAULT_CONTEXT_HEADING,
        body: contextText,
      },
    ];
  },
};

// ── Finance nav entries ──────────────────────────────────────────────────────

/** coreNavItems mapped to DomainNavEntry (icon as string name for serialisation). */
const financeNavEntries: DomainNavEntry[] = coreNavItems.map((item) => ({
  id: item.id,
  href: item.href,
  label: item.label,
  icon: item.icon.displayName ?? item.icon.name ?? item.id,
}));

// ── Finance domain module ─────────────────────────────────────────────────────

export const financeDomainModule: DomainModule = {
  id: "finance",
  core: true,
  tools: getFinancialTools(),
  handlers: toolHandlers,
  contextContributors: [financeContributor],
  promptSections: [],
  navEntries: financeNavEntries,
  /** Exclude display/input/plan-flavor tools and any explicitly MCP-excluded tools. */
  mcpExclude: (t) => MCP_SERVER_EXCLUDED_TOOLS.has(t.name),
};
