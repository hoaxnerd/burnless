/**
 * Revenue stream modeling tools — full CRUD.
 * Funding round tools have been moved to ./funding.ts
 */

import { db, scenarioInsert, scenarioUpdate, scenarioDelete } from "@burnless/db";
import { revenueStreams } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  AddRevenueStreamSchema,
  UpdateRevenueStreamSchema,
} from "@burnless/ai";
import type { ToolContext, ToolHandler } from "./types";
import {
  idString,
} from "./types";

// ── Schemas ──────────────────────────────────────────────────────────────────

// Canonical schemas — sourced from @burnless/ai (single source of truth)
export const addRevenueStreamSchema = AddRevenueStreamSchema;
export const updateRevenueStreamSchema = UpdateRevenueStreamSchema;

export const deleteRevenueStreamSchema = z.object({
  id: idString,
});

// ── Handlers ─────────────────────────────────────────────────────────────────

async function addRevenueStream(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = addRevenueStreamSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ success: false, error: parsed.error.message });
  }
  const data = parsed.data;

  const row = await scenarioInsert("revenue_stream", revenueStreams, {
    companyId: context.companyId,
    name: data.name,
    type: data.type,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    parameters: data.parameters,
  }, context.scenarioId);

  return JSON.stringify({
    success: true,
    revenueStreamId: row!.id,
    message: `Created revenue stream "${data.name}" (${data.type}).`,
  });
}

async function updateRevenueStream(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = updateRevenueStreamSchema.safeParse(input);
  if (!parsed.success) {
    return JSON.stringify({ success: false, error: parsed.error.message });
  }
  const data = parsed.data;

  // Verify ownership
  const [existing] = await db
    .select({ id: revenueStreams.id, name: revenueStreams.name, companyId: revenueStreams.companyId })
    .from(revenueStreams)
    .where(and(eq(revenueStreams.id, data.id), eq(revenueStreams.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Revenue stream not found or access denied" });
  }

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.startDate !== undefined) updates.startDate = new Date(data.startDate);
  // endDate is explicitly nullable — include it even when null (to allow clearing)
  if ("endDate" in data && data.endDate !== undefined) {
    updates.endDate = data.endDate ? new Date(data.endDate) : null;
  }
  if (data.parameters !== undefined) updates.parameters = data.parameters;

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  await scenarioUpdate("revenue_stream", revenueStreams, data.id, updates, context.scenarioId);

  return JSON.stringify({
    success: true,
    message: `Updated revenue stream "${data.name ?? existing.name}".`,
  });
}

async function deleteRevenueStream(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const data = input as z.infer<typeof deleteRevenueStreamSchema>;

  // Verify ownership
  const [existing] = await db
    .select({ id: revenueStreams.id, name: revenueStreams.name, companyId: revenueStreams.companyId })
    .from(revenueStreams)
    .where(and(eq(revenueStreams.id, data.id), eq(revenueStreams.companyId, context.companyId)));
  if (!existing) {
    return JSON.stringify({ success: false, error: "Revenue stream not found or access denied" });
  }

  await scenarioDelete("revenue_stream", revenueStreams, data.id, context.scenarioId);

  return JSON.stringify({
    success: true,
    message: `Deleted revenue stream "${existing.name}".`,
  });
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const revenueSchemas: Record<string, z.ZodType> = {
  add_revenue_stream: addRevenueStreamSchema,
  update_revenue_stream: updateRevenueStreamSchema,
  delete_revenue_stream: deleteRevenueStreamSchema,
};

export const revenueHandlers: Record<string, ToolHandler> = {
  add_revenue_stream: addRevenueStream,
  update_revenue_stream: updateRevenueStream,
  delete_revenue_stream: deleteRevenueStream,
};
