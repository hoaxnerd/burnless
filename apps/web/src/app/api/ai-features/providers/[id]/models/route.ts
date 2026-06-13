import { NextResponse } from "next/server";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireSelfManagedAi } from "@/lib/ai-providers/guard";
import { getAiProvider, addAiProviderModel, setDefaultAiProviderModel } from "@burnless/db";
import { addModelSchema } from "@/lib/ai-providers/schemas";

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (request: Request, { params }: Params) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const gate = requireSelfManagedAi();
  if (gate) return gate;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;
  const provider = await getAiProvider(id, ctx.companyId);
  if (!provider) return errorResponse("Provider not found", 404);
  const parsed = addModelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid request body", 400);
  const { isDefault, ...data } = parsed.data;
  const model = await addAiProviderModel(id, { ...data, source: "manual" });
  if (isDefault) await setDefaultAiProviderModel(model.id, id);
  return NextResponse.json({ model }, { status: 201 });
});
