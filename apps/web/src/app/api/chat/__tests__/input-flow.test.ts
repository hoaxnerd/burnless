// apps/web/src/app/api/chat/__tests__/input-flow.test.ts
//
// End-to-end input flow (genui plan 4 Task 4): pause → submit → resume, driven
// against the REAL preset-derived spec shape produced by buildInputFormSpec
// ("request_revenue_stream"). Complements resume-input.test.ts (Plan 1, generic
// hand-rolled spec) by proving:
//   1. the preset spec round-trips through createPendingAction → resume route,
//   2. submitting the form synthesizes a tool_result for the form's tool_use id,
//   3. the pending row is actually RESOLVED (single-active slot freed),
//   4. the missing-required path returns 400 and leaves the row UNRESOLVED.
// PGLite gives real query semantics for the pending/conversation/scenario reads;
// the SSE responder + tool executor + auth boundaries are mocked (same harness
// pattern as resume-input.test.ts / Plan 1 Task 7).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

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

vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async () => JSON.stringify({ success: true })),
  logDeniedToolCall: vi.fn(),
}));

vi.mock("@/lib/chat-stream", () => ({
  buildChatSSEResponse: vi.fn((params: { scenarioId: string; messages: unknown[] }) => {
    hoisted.capturedSSEParams = { scenarioId: params.scenarioId, messages: params.messages };
    return new Response("data: {}\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    });
  }),
}));

import { createUser, createCompany, createScenario } from "@db-test/factories";
import {
  db,
  aiConversations,
  aiMessages,
  aiPendingActions,
  createPendingAction,
  getActivePendingAction,
} from "@burnless/db";
import { eq } from "drizzle-orm";
import { buildInputFormSpec } from "@burnless/ai";

const INPUT_TOOL_USE_ID = "tu-rev-1";

async function seedRevenueStreamPause() {
  const user = await createUser();
  const company = await createCompany(user.id);
  hoisted.userId = user.id;
  hoisted.companyId = company.id;

  const scenario = await createScenario(company.id, {
    name: "Base Case",
    source: "blank",
    status: "active",
  });

  const [conv] = await db
    .insert(aiConversations)
    .values({ companyId: company.id, userId: user.id, title: "t" })
    .returning();
  const conversationId = conv!.id;
  await db.insert(aiMessages).values({
    conversationId,
    role: "user",
    content: "help me add a revenue stream",
  });

  // REAL preset spec the model would have produced via the request_revenue_stream
  // tool — derived from buildInputFormSpec, not hand-rolled.
  const spec = buildInputFormSpec("request_revenue_stream", {
    defaults: { name: "Pro Plan", monthlyAmount: 4900 },
  });

  const pauseId = "p-rev-flow";
  const pendingRow = await createPendingAction({
    conversationId,
    pauseId,
    kind: "input",
    scenarioId: scenario.id,
    assistantBlocks: [
      {
        type: "tool_use",
        id: INPUT_TOOL_USE_ID,
        name: "request_revenue_stream",
        input: { defaults: { name: "Pro Plan", monthlyAmount: 4900 } },
      },
    ],
    completedResults: [],
    pending: { inputToolUseId: INPUT_TOOL_USE_ID, spec },
  });

  return { conversationId, pauseId, pendingRowId: pendingRow.id, spec };
}

describe("input flow — pause → submit → resume (PGLite)", () => {
  beforeEach(() => {
    hoisted.capturedSSEParams = null;
  });

  it("submits the preset form, synthesizes a tool_result, and resolves the pending row", async () => {
    const { conversationId, pauseId, pendingRowId } = await seedRevenueStreamPause();

    const formData = {
      name: "Pro Plan",
      type: "subscription",
      monthlyAmount: 4900,
      startDate: "2026-07-01",
    };

    const { POST } = await import("../resume/route");
    const res = await POST(
      new Request("http://localhost/api/chat/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, pauseId, formData }),
      })
    );

    expect(res.status).toBe(200);

    // The captured resume messages carry a tool_result for the form's tool_use id
    // with the full submitted payload.
    const passed = hoisted.capturedSSEParams as {
      messages: { role: string; content: unknown }[];
    };
    const last = passed.messages.at(-1)!;
    expect(last.role).toBe("user");
    const toolResult = (
      last.content as { type: string; toolUseId: string; content: string }[]
    ).find((b) => b.toolUseId === INPUT_TOOL_USE_ID)!;
    expect(toolResult).toBeTruthy();
    expect(toolResult.type).toBe("tool_result");
    expect(JSON.parse(toolResult.content)).toMatchObject(formData);

    // The pending row is resolved: single-active slot is freed.
    expect(await getActivePendingAction(conversationId)).toBeNull();
    const [row] = await db
      .select()
      .from(aiPendingActions)
      .where(eq(aiPendingActions.id, pendingRowId));
    expect(row!.resolvedAt).not.toBeNull();
  });

  it("returns 400 and leaves the pending row unresolved when a required field is missing", async () => {
    const { conversationId, pauseId, pendingRowId } = await seedRevenueStreamPause();

    const { POST } = await import("../resume/route");
    const res = await POST(
      new Request("http://localhost/api/chat/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // omit required `name`
        body: JSON.stringify({
          conversationId,
          pauseId,
          formData: { type: "subscription", monthlyAmount: 4900, startDate: "2026-07-01" },
        }),
      })
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/name/);

    // Row stays active so the user can retry.
    expect(hoisted.capturedSSEParams).toBeNull();
    expect(await getActivePendingAction(conversationId)).not.toBeNull();
    const [row] = await db
      .select()
      .from(aiPendingActions)
      .where(eq(aiPendingActions.id, pendingRowId));
    expect(row!.resolvedAt).toBeNull();
  });
});
