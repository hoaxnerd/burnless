// apps/web/src/app/api/automations/dry-run/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyAccess, requireRole, withErrorHandler } from "@/lib/api-helpers";
import { dryRunJobDraft } from "@/lib/automations/runner";

const schema = z.object({
  prompt: z.string().min(1).max(4000),
  actionKind: z.enum(["write", "notify"]),
  allowedTools: z.array(z.string().max(200)).max(50),
  boundConnectionIds: z.array(z.string().max(100)).max(20).default([]),
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const draft = schema.parse(await request.json());
  // companyId/userId come from the session — NEVER from the request body.
  const preview = await dryRunJobDraft({ ...draft, companyId: ctx.companyId, createdByUserId: ctx.userId });
  return NextResponse.json(preview);
});
