/**
 * company-knowledge domain module (A3b-2).
 *
 * The first real non-finance domain. Registering it surfaces its tools, context,
 * and prompt section to the model purely by registration; toggling it off (the
 * per-company `aiFeatureFlags.features["company-knowledge"]` flag) removes all of
 * them, with finance unaffected.
 *
 * core:false — governed only by the per-company toggle (no deployment capability gate).
 * mcpExclude omitted → the 3 tools are MCP-exposed too.
 */

import type {
  ToolDefinition,
  ContextContributor,
  ContextSection,
  ContributeCtx,
  PromptSection,
} from "@burnless/ai";
import { listMemory } from "@burnless/db";
import { companyKnowledgeHandlers } from "@/lib/ai-tools/company-knowledge";
import type { DomainModule } from "./contracts";

const DOMAIN = "company-knowledge";
const KIND = "company_fact";

export const companyKnowledgeTools: ToolDefinition[] = [
  {
    name: "remember_fact",
    description:
      "Record a durable fact about this company that the founder stated (e.g. fundraising status, key customers, strategic constraints). Use when the user shares something worth remembering across conversations.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The fact to remember, as a single clear sentence." },
        label: { type: "string", description: "Optional short label/title for the fact." },
      },
      required: ["content"],
    },
    mutates: "write",
    nonFacade: true,
  },
  {
    name: "list_facts",
    description: "List the durable company facts previously recorded with remember_fact.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "forget_fact",
    description: "Delete a previously recorded company fact by its id (from list_facts).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The fact id to forget." } },
      required: ["id"],
    },
    mutates: "delete",
    nonFacade: true,
  },
];

export const companyKnowledgeContributor: ContextContributor = {
  id: "company-knowledge-facts",
  domain: DOMAIN,
  async sections(ctx: ContributeCtx): Promise<ContextSection[]> {
    try {
      const rows = await listMemory({
        companyId: ctx.companyId,
        domain: DOMAIN,
        kind: KIND,
        tier: "block",
      });
      if (rows.length === 0) return [];
      const body = rows
        .map((r) => `- ${r.label ? `**${r.label}:** ` : ""}${r.content}`)
        .join("\n");
      return [{ heading: "What you should know about this company", body, order: 10 }];
    } catch {
      // Graceful degradation (spec §8): a memory-read failure must never break the turn.
      return [];
    }
  },
};

const companyKnowledgePrompt: PromptSection = {
  id: "company-knowledge-prompt",
  domain: DOMAIN,
  body:
    "You can record durable facts the founder states about their company using the `remember_fact` tool, list them with `list_facts`, and remove them with `forget_fact`. Record a fact only when the user shares something worth remembering across conversations.",
  order: 10,
};

export const companyKnowledgeModule: DomainModule = {
  id: DOMAIN,
  core: false,
  tools: companyKnowledgeTools,
  handlers: companyKnowledgeHandlers, // contract field; real dispatch is the global toolHandlers map
  contextContributors: [companyKnowledgeContributor],
  promptSections: [companyKnowledgePrompt],
  navEntries: [], // UI deferred (Part 1 ships primitives only)
  // mcpExclude omitted → the 3 tools are MCP-exposed too.
};
