// apps/web/src/app/api/chat/__tests__/resume-multi-pause-loop.test.ts
//
// ROOT-CAUSE regression guard for the multi-pause resume loop (Phase 3).
//
// The bug: under the default `confirm` write-mode EVERY write pauses. In a turn
// that writes twice (create_scenario → pause/approve → create_revenue_stream →
// pause/approve), the OLD resume reconstructed the model thread from `aiMessages`
// (persisted only on `done`) + the LATEST pause's assistantBlocks/completedResults.
// The tool call completed in the FIRST resume segment lived in NEITHER source, so
// it vanished from the model's context on the SECOND resume → the model re-did the
// completed work → infinite loop.
//
// The fix: resume projects the COMPLETE provider thread from the durable
// append-as-you-go turn-event log (`aiTurnEvents`) via projectModelThread. Every
// prior pause's tool_use is already paired with its tool_result in the log, so the
// projected thread still carries the first step after ANY number of pauses.
//
// This test reproduces the exact two-pause shape in the log (as Phase 1+2 write it)
// and proves: after the SECOND resume, the thread handed to the continuation
// (chatStream) STILL contains the FIRST create_scenario tool_use AND its
// tool_result. With the old aiMessages reconstruction the first step would be
// absent — so the model would re-create it (the loop). With the log projection it
// survives losslessly.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { projectModelThread, type TurnEvent } from "@burnless/ai";

import "@db-test/setup";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

const { hoisted } = vi.hoisted(() => ({
  hoisted: {
    companyId: "",
    userId: "",
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
vi.mock("@/lib/api-rate-limit", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/ai-feature-flags", () => ({
  checkAiFeatureAllowed: vi.fn(async () => ({ allowed: true, creditStatus: null, writeMode: "confirm" })),
  getCompanyProviderConfig: vi.fn(async () => undefined),
  getAiFlags: vi.fn(async () => ({ companionName: "Aria" })),
}));
vi.mock("@/lib/build-ai-context", () => ({
  buildAiContext: vi.fn(async () => ({ contextText: "ctx", snapshot: {} })),
}));
vi.mock("@/lib/ai-usage-tracker", () => ({ setTrackingCompanyId: vi.fn() }));
vi.mock("@/lib/ai-tools", () => ({
  // The second resume's approved tool returns a canned success. (The first
  // create_scenario's executed result is already in the log — this test seeds it
  // exactly as the first resume would have appended it.)
  executeToolCall: vi.fn(async () => JSON.stringify({ success: true, id: "rev-1" })),
  logDeniedToolCall: vi.fn(),
}));
vi.mock("@/lib/domains", () => ({
  domainRegistry: {
    getActiveTools: vi.fn(async () => []),
    getActivePromptSections: vi.fn(async () => []),
    getActiveContextContributors: vi.fn(async () => [
      {
        id: "finance-snapshot",
        domain: "finance",
        sections: async (ctx: { companyId: string }) => {
          const { buildAiContext } = await import("@/lib/build-ai-context");
          const { contextText } = await buildAiContext(ctx.companyId, { id: "base", name: "Baseline", source: "base" });
          return [{ heading: "Current Financial Data", body: contextText }];
        },
      },
    ]),
  },
}));
vi.mock("@/lib/chat-stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat-stream")>();
  return {
    ...actual,
    buildChatSSEResponse: vi.fn((params: { scenarioId: string; messages: unknown[] }) => {
      hoisted.capturedSSEParams = { scenarioId: params.scenarioId, messages: params.messages };
      return new Response("data: {}\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }),
  };
});

import { createUser, createCompany, createScenario } from "@db-test/factories";
import {
  db,
  aiConversations,
  appendTurnEvent,
  getTurnEvents,
} from "@burnless/db";

describe("POST /api/chat/resume — multi-pause loop regression (PGLite)", () => {
  beforeEach(() => {
    hoisted.capturedSSEParams = null;
  });

  it("the FIRST step (create_scenario tool_use + result) survives the SECOND resume's projected thread", async () => {
    // ── Seed company + scenario the turn operates in ─────────────────────────
    const user = await createUser();
    const company = await createCompany(user.id);
    hoisted.userId = user.id;
    hoisted.companyId = company.id;
    const scn = await createScenario(company.id, { name: "Base", source: "blank", status: "active" });

    const [conv] = await db
      .insert(aiConversations)
      .values({ companyId: company.id, userId: user.id, title: "t" })
      .returning();
    const conversationId = conv!.id;

    const turnId = "turn-multi";
    const TU1 = "tu-create-scenario"; // first write, completed in the FIRST resume
    const TU2 = "tu-create-revenue"; // second write, gated at the SECOND pause

    // ── The durable log AS IT STANDS AT THE SECOND PAUSE ─────────────────────
    // This is exactly what Phase 1+2 append across the first pause/resume cycle:
    //   1. user_message
    //   2. assistant_step (create_scenario tool_use)  ← FIRST step
    //   3. tool_result (TU1, executed)                ← appended by the FIRST resume
    //   4. assistant_step (create_revenue_stream tool_use)
    //   5. gate (permission, pauseId=pause-2, UNRESOLVED)  ← the SECOND pause
    await appendTurnEvent({ conversationId, turnId, type: "user_message", payload: { text: "make a scenario then add revenue" } });
    await appendTurnEvent({
      conversationId, turnId, type: "assistant_step",
      payload: { toolUses: [{ id: TU1, name: "create_scenario", input: { name: "Aggressive" } }] },
    });
    await appendTurnEvent({
      conversationId, turnId, type: "tool_result",
      payload: { toolUseId: TU1, toolName: "create_scenario", result: JSON.stringify({ success: true, scenarioId: scn.id, name: "Aggressive" }), kind: "executed" },
    });
    await appendTurnEvent({
      conversationId, turnId, type: "assistant_step",
      payload: { toolUses: [{ id: TU2, name: "create_revenue_stream", input: { name: "Pro" } }] },
    });
    await appendTurnEvent({
      conversationId, turnId, type: "gate",
      payload: { pauseId: "pause-2", kind: "permission", actions: [{ requestId: TU2, toolName: "create_revenue_stream", toolInput: { name: "Pro" } }], scenarioId: scn.id, writeScenarioId: scn.id },
    });

    // (Phase 4 removed the dual-written `aiPendingActions` row entirely — resume now
    // reads the gate's payload + the durable log only. This test proves the fix does
    // NOT depend on any pending-row reconstruction: the projected thread below is
    // built solely from `aiTurnEvents`.)

    // ── SECOND resume: approve the create_revenue_stream write ───────────────
    const { POST } = await import("../resume/route");
    const res = await POST(
      new Request("http://localhost/api/chat/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, pauseId: "pause-2", decisions: [{ requestId: TU2, decision: "once" }] }),
      })
    );
    expect(res.status).toBe(200);

    // ── ASSERTION 1: the projected log thread still contains the FIRST step ──
    // (the actual fix — projectModelThread over the complete log).
    const thread = projectModelThread((await getTurnEvents(conversationId)) as unknown as TurnEvent[]);

    const firstToolUse = thread
      .filter((m) => m.role === "assistant" && Array.isArray(m.content))
      .flatMap((m) => m.content as { type: string; id?: string; name?: string }[])
      .find((b) => b.type === "tool_use" && b.name === "create_scenario");
    expect(firstToolUse).toBeDefined();
    expect(firstToolUse!.id).toBe(TU1);

    const firstResult = thread
      .filter((m) => m.role === "user" && Array.isArray(m.content))
      .flatMap((m) => m.content as { type: string; toolUseId?: string }[])
      .find((b) => b.type === "tool_result" && b.toolUseId === TU1);
    expect(firstResult).toBeDefined();

    // The second resume's approved result is also present (TU2), so the thread is
    // complete and the model would CONTINUE, not re-create the scenario.
    const secondResult = thread
      .filter((m) => m.role === "user" && Array.isArray(m.content))
      .flatMap((m) => m.content as { type: string; toolUseId?: string }[])
      .find((b) => b.type === "tool_result" && b.toolUseId === TU2);
    expect(secondResult).toBeDefined();

    // ── ASSERTION 2: the EXACT thread handed to the continuation (chatStream)
    // includes the first step + its result — the model literally sees it. ─────
    expect(hoisted.capturedSSEParams).not.toBeNull();
    const passed = hoisted.capturedSSEParams!.messages as { role: string; content: unknown }[];
    const passedFirstToolUse = passed
      .filter((m) => m.role === "assistant" && Array.isArray(m.content))
      .flatMap((m) => m.content as { type: string; id?: string; name?: string }[])
      .find((b) => b.type === "tool_use" && b.id === TU1);
    expect(passedFirstToolUse).toBeDefined();
    const passedFirstResult = passed
      .filter((m) => m.role === "user" && Array.isArray(m.content))
      .flatMap((m) => m.content as { type: string; toolUseId?: string }[])
      .find((b) => b.type === "tool_result" && b.toolUseId === TU1);
    expect(passedFirstResult).toBeDefined();
  });
});
