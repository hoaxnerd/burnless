// apps/web/src/app/api/chat/__tests__/resume.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { categorizeToolName, resolvePermission, BUILTIN_PERMISSION_DEFAULTS } from "@burnless/ai";

/**
 * Resume orchestration is exercised end-to-end in e2e; here we (1) lock the pure
 * decision logic the route depends on, so a regression in category/resolver
 * mapping is caught without standing up the full SSE + provider stack, and (2)
 * run a deterministic PGLite + mocked-provider integration test that proves the
 * route's DB orchestration: scenario targeting, one-tool_result-per-tool_use-id
 * synthesis, and single-active resolve.
 */
describe("resume decision mapping", () => {
  it("a denied write never resolves to allow", () => {
    // deny is a runtime user choice; the resolver itself only returns allow|ask
    expect(resolvePermission("create_forecast_line", { defaults: BUILTIN_PERMISSION_DEFAULTS, sessionGrants: {} })).toBe("ask");
  });

  it("granting a category for session allows the SAME category next time", () => {
    const cat = categorizeToolName("create_forecast_line");
    expect(resolvePermission("update_forecast_line", { defaults: BUILTIN_PERMISSION_DEFAULTS, sessionGrants: { [cat]: true } })).toBe("allow");
  });

  it("a delete still asks even when write was granted for session", () => {
    expect(resolvePermission("delete_scenario", { defaults: BUILTIN_PERMISSION_DEFAULTS, sessionGrants: { write: true } })).toBe("ask");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 2b: deterministic PGLite + mocked-provider resume integration test.
//
// Imports `@db-test/setup` (triggers the apps/web vitest.setup.db.ts globalThis
// hijack: @burnless/db's singleton `db` becomes the PGLite instance, so the
// route's real queries — getActivePendingAction / resolvePendingAction /
// conversation+scenario lookups — run against real Postgres semantics).
// ─────────────────────────────────────────────────────────────────────────────
import "@db-test/setup";

// next/cache + react.cache: passthroughs so revalidateTag / cache() do not need
// a Next.js request scope under PGLite.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

// Auth/rate-limit boundary: authenticate as the seeded company/user, no limiting.
const { hoisted } = vi.hoisted(() => ({
  hoisted: {
    companyId: "",
    userId: "",
    // captured by the executeToolCall mock so we can assert scenario targeting
    capturedToolContexts: [] as Array<{ scenarioId?: string }>,
    // captured by the buildChatSSEResponse mock so we can assert reconstruction
    capturedSSEParams: null as null | { scenarioId: string; messages: unknown[] },
  },
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: vi.fn(async () => ({
    userId: hoisted.userId,
    companyId: hoisted.companyId,
    role: "owner" as const,
  })),
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/ai-feature-flags", () => ({
  checkAiFeatureAllowed: vi.fn(async () => ({ allowed: true, creditStatus: null })),
  getCompanyProviderConfig: vi.fn(async () => undefined),
  getAiFlags: vi.fn(async () => ({ companionName: "Aria" })),
}));

vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: vi.fn(async () => ({ contextText: "ctx", snapshot: {} })),
}));

vi.mock("@/lib/ai-usage-tracker", () => ({
  setTrackingCompanyId: vi.fn(),
}));

// Mock the tool executor: capture the context (proves scenario targeting) and
// return a canned JSON result. This is the "mock the provider" boundary — no
// real LLM/tool side effects, fully deterministic.
vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async (_tool: string, _input: unknown, context: { scenarioId?: string }) => {
    hoisted.capturedToolContexts.push({ scenarioId: context.scenarioId });
    return JSON.stringify({ success: true, scenarioId: context.scenarioId });
  }),
  logDeniedToolCall: vi.fn(),
}));

// Mock the shared SSE responder: capture the reconstructed messages + scenarioId
// (proves one-tool_result-per-tool_use-id), and return a dummy stream so the
// continuation does NOT call a real provider.
vi.mock("@/lib/chat-stream", () => ({
  buildChatSSEResponse: vi.fn((params: { scenarioId: string; messages: unknown[] }) => {
    hoisted.capturedSSEParams = { scenarioId: params.scenarioId, messages: params.messages };
    return new Response("data: {}\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    });
  }),
}));

import {
  createUser,
  createCompany,
  createScenario,
} from "@db-test/factories";
import { db, aiConversations, aiMessages, createPendingAction } from "@burnless/db";

describe("POST /api/chat/resume — integration (PGLite)", () => {
  beforeEach(() => {
    hoisted.capturedToolContexts.length = 0;
    hoisted.capturedSSEParams = null;
  });

  it("executes held tools against the PERSISTED non-default scenario, synthesizes one tool_result per tool_use, and resolves the pending row", async () => {
    // ── Seed company + a DEFAULT scenario + a NON-DEFAULT scenario ────────────
    const user = await createUser();
    const company = await createCompany(user.id);
    hoisted.userId = user.id;
    hoisted.companyId = company.id;

    // The default scenario the resume route must NOT pick.
    await createScenario(company.id, { name: "Base Case", source: "blank", status: "active" });
    // The scenario the paused turn was operating in.
    const pausedScenario = await createScenario(company.id, {
      name: "Aggressive Growth",
      source: "ai",
      status: "active",
    });

    // ── Conversation with a prior user message ────────────────────────────────
    const [conv] = await db
      .insert(aiConversations)
      .values({ companyId: company.id, userId: user.id, title: "t" })
      .returning();
    const conversationId = conv!.id;
    await db.insert(aiMessages).values({
      conversationId,
      role: "user",
      content: "make a scenario",
    });

    // ── A paused turn: one pending create_scenario, persisting the NON-default
    //    scenario as the active overlay. ───────────────────────────────────────
    const pauseId = "pause-int-1";
    const requestId = "t1";
    const pendingRow = await createPendingAction({
      conversationId,
      pauseId,
      scenarioId: pausedScenario.id,
      assistantBlocks: [
        { type: "tool_use", id: requestId, name: "create_scenario", input: { name: "X" } },
      ],
      completedResults: [],
      pending: [{ requestId, toolName: "create_scenario", toolInput: { name: "X" } }],
    });

    // ── POST /api/chat/resume with decision "once" ────────────────────────────
    const { POST } = await import("../resume/route");
    const res = await POST(
      new Request("http://localhost/api/chat/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          pauseId,
          decisions: [{ requestId, decision: "once" }],
        }),
      })
    );

    expect(res.status).toBe(200);

    // (a) the tool executed against the PERSISTED scenarioId (not the default).
    expect(hoisted.capturedToolContexts).toHaveLength(1);
    expect(hoisted.capturedToolContexts[0]!.scenarioId).toBe(pausedScenario.id);
    expect(hoisted.capturedSSEParams!.scenarioId).toBe(pausedScenario.id);

    // (b) every tool_use id has exactly one tool_result in the reconstructed
    //     user message (the last message carries all tool_result blocks).
    const messages = hoisted.capturedSSEParams!.messages as Array<{
      role: string;
      content: unknown;
    }>;
    const lastUser = messages[messages.length - 1]!;
    expect(lastUser.role).toBe("user");
    const resultBlocks = (lastUser.content as Array<{ type: string; toolUseId?: string }>).filter(
      (b) => b.type === "tool_result"
    );
    expect(resultBlocks).toHaveLength(1);
    expect(resultBlocks.map((b) => b.toolUseId)).toEqual([requestId]);

    // (c) the pending row is resolved (single-active slot freed).
    const [refreshed] = await db
      .select()
      .from((await import("@burnless/db")).aiPendingActions)
      .where(
        (await import("drizzle-orm")).eq(
          (await import("@burnless/db")).aiPendingActions.id,
          pendingRow.id
        )
      );
    expect(refreshed!.resolvedAt).not.toBeNull();
  });
});
