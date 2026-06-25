/**
 * company-knowledge AI tool handlers (A3b-2).
 *
 * Three handlers — remember_fact / list_facts / forget_fact — backed by the
 * unified `memory` table (A3b-1). All facts are kind="company_fact", tier="block",
 * domain="company-knowledge", with embedding=null (A5 adds embedding/search logic).
 *
 * Return convention mirrors funding.ts: JSON.stringify({ success, ... }).
 */

import { z } from "zod";
import { insertMemory, listMemory, deleteMemoryById, type MemoryRow } from "@burnless/db";
import type { ToolHandler } from "./types";
import { requireCompanyId } from "./types";

const DOMAIN = "company-knowledge";
const KIND = "company_fact";

const RememberFactSchema = z.object({
  content: z.string().min(1, "content is required"),
  label: z.string().optional(),
});
const ListFactsSchema = z.object({});
const ForgetFactSchema = z.object({ id: z.string().min(1, "id is required") });

const rememberFact: ToolHandler = async (input, context) => {
  const parsed = RememberFactSchema.safeParse(input);
  if (!parsed.success) return JSON.stringify({ success: false, error: parsed.error.message });
  const ctx = requireCompanyId(context);
  const row = await insertMemory({
    companyId: ctx.companyId,
    userId: ctx.userId,
    domain: DOMAIN,
    kind: KIND,
    tier: "block",
    label: parsed.data.label ?? null,
    content: parsed.data.content,
    embedding: null,
  });
  return JSON.stringify({
    success: true,
    factId: row.id,
    message: `Recorded company fact${parsed.data.label ? ` "${parsed.data.label}"` : ""}.`,
  });
};

const listFacts: ToolHandler = async (_input, context) => {
  const ctx = requireCompanyId(context);
  const rows = await listMemory({ companyId: ctx.companyId, domain: DOMAIN, kind: KIND, tier: "block" });
  return JSON.stringify({
    success: true,
    facts: rows.map((r: MemoryRow) => ({ id: r.id, label: r.label, content: r.content })),
  });
};

const forgetFact: ToolHandler = async (input, context) => {
  const parsed = ForgetFactSchema.safeParse(input);
  if (!parsed.success) return JSON.stringify({ success: false, error: parsed.error.message });
  const ctx = requireCompanyId(context);
  const row = await deleteMemoryById(parsed.data.id, ctx.companyId);
  if (!row) return JSON.stringify({ success: false, error: "Fact not found or access denied" });
  return JSON.stringify({ success: true, message: "Forgot company fact." });
};

export const companyKnowledgeHandlers: Record<string, ToolHandler> = {
  remember_fact: rememberFact,
  list_facts: listFacts,
  forget_fact: forgetFact,
};

export const companyKnowledgeSchemas: Record<string, z.ZodType> = {
  remember_fact: RememberFactSchema,
  list_facts: ListFactsSchema,
  forget_fact: ForgetFactSchema,
};
