/**
 * GET the active non-finance domain tools (name + mutation class) for the Tools
 * pane (A3b-3). Finance tools are already bundled client-side via
 * getFinancialTools(), so the pane lists those statically; this surfaces
 * domain-registered tools (e.g. company-knowledge's remember_fact/forget_fact)
 * so they each get a per-tool enable toggle with the correct read/write/delete
 * class. Resolved through the domain registry (which domains are active is
 * company-scoped), so it must run server-side.
 */
import { NextResponse } from "next/server";
import { getFinancialTools } from "@burnless/ai";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const { domainRegistry } = await import("@/lib/domains");
  const financeNames = new Set(getFinancialTools().map((t) => t.name));
  const tools = (await domainRegistry.getActiveTools({ companyId: ctx.companyId }))
    .filter((t) => !financeNames.has(t.name) && !t.name.startsWith("mcp__"))
    .map((t) => ({ name: t.name, mutates: t.mutates ?? null }));

  return NextResponse.json({ tools });
});
