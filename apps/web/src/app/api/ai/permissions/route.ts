/** GET/PUT the caller's per-user AI tool permission defaults. */
import { z } from "zod";
import { NextResponse } from "next/server";
import { getPermissionDefaults, upsertPermissionDefaults } from "@burnless/db";
import { BUILTIN_PERMISSION_DEFAULTS } from "@burnless/ai";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";

const modeFull = z.enum(["ask", "session", "always"]);
const modeNoAlways = z.enum(["ask", "session"]);

const putSchema = z.object({
  readMode: modeFull.optional(),
  writeMode: modeFull.optional(),
  deleteMode: modeNoAlways.optional(), // delete never "always"
  webSearchMode: modeFull.optional(),
  browserUseMode: modeFull.optional(),
});

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const row = await getPermissionDefaults(ctx.userId, ctx.companyId);
  const defaults = row
    ? {
        readMode: row.readMode,
        writeMode: row.writeMode,
        deleteMode: row.deleteMode,
        webSearchMode: row.webSearchMode,
        browserUseMode: row.browserUseMode,
      }
    : {
        readMode: BUILTIN_PERMISSION_DEFAULTS.read,
        writeMode: BUILTIN_PERMISSION_DEFAULTS.write,
        deleteMode: BUILTIN_PERMISSION_DEFAULTS.delete,
        webSearchMode: BUILTIN_PERMISSION_DEFAULTS.web_search,
        browserUseMode: BUILTIN_PERMISSION_DEFAULTS.browser_use,
      };
  return NextResponse.json({ defaults });
});

export const PUT = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  let patch: z.infer<typeof putSchema>;
  try {
    patch = putSchema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  await upsertPermissionDefaults(ctx.userId, ctx.companyId, patch);
  const row = await getPermissionDefaults(ctx.userId, ctx.companyId);
  return NextResponse.json({
    defaults: {
      readMode: row!.readMode,
      writeMode: row!.writeMode,
      deleteMode: row!.deleteMode,
      webSearchMode: row!.webSearchMode,
      browserUseMode: row!.browserUseMode,
    },
  });
});
