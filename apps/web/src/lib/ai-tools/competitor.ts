/**
 * Competitor read-only AI tools (Task 9 — competitor analysis spine).
 *
 * `list_competitors` — returns the company's tracked competitors.
 * `list_competitor_changes` — returns recent detected changes across competitors.
 *
 * READ-ONLY: no `mutates`, no AI provider needed to run (deterministic DB query).
 * These give the AI grounding but require no special capability.
 */

import { z } from "zod";
import type { ToolDefinition } from "@burnless/ai";
import { listCompetitors, listChanges } from "@burnless/db";
import type { ToolHandler } from "./types";

// ── Tool definitions ──────────────────────────────────────────────────────────

export const competitorTools: ToolDefinition[] = [
  {
    name: "list_competitors",
    description:
      "List the competitors tracked for this company (name, URL, status). Use this to see which competitors are being monitored and to resolve competitor names before querying changes.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_competitor_changes",
    description:
      "List recent detected changes across tracked competitors (e.g. price changes, new pricing plans, follower count shifts). Returns the most recent changes first.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of changes to return (default 20).",
        },
      },
    },
  },
];

// ── Zod schemas (for toolSchemas / validateToolInput in index.ts) ─────────────

const listCompetitorsSchema = z.object({});

const listCompetitorChangesSchema = z.object({
  limit: z.number().int().positive().optional(),
});

export const competitorSchemas: Record<string, z.ZodType> = {
  list_competitors: listCompetitorsSchema,
  list_competitor_changes: listCompetitorChangesSchema,
};

// ── Handlers ──────────────────────────────────────────────────────────────────

export const competitorHandlers: Record<string, ToolHandler> = {
  async list_competitors(_input, ctx) {
    if (!ctx.companyId) return "No company in context.";
    const rows = await listCompetitors(ctx.companyId);
    if (rows.length === 0) return "No competitors are being tracked yet.";
    return rows.map((c) => `- ${c.name} (${c.url}) [${c.status}]`).join("\n");
  },

  async list_competitor_changes(input, ctx) {
    if (!ctx.companyId) return "No company in context.";
    const limit = typeof input.limit === "number" ? input.limit : 20;
    const rows = await listChanges(ctx.companyId, { limit });
    if (rows.length === 0) return "No competitor changes detected yet.";
    return rows
      .map((r) => `- [${r.severity}] ${r.changeType}: ${r.summary}`)
      .join("\n");
  },
};
