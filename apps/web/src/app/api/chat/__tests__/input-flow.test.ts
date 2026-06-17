// apps/web/src/app/api/chat/__tests__/input-flow.test.ts
//
// End-to-end input flow (genui plan 4 Task 4): pause → submit → resume, driven
// against the REAL preset-derived spec shape produced by buildInputFormSpec
// ("request_revenue_stream"). Complements resume-input.test.ts (Plan 1, generic
// hand-rolled spec) by proving:
//   1. the preset spec round-trips through the input gate event → resume route,
//   2. submitting the form synthesizes a tool_result for the form's tool_use id,
//   3. the open gate is actually RESOLVED (single-open slot freed),
//   4. the missing-required path returns 400 and leaves the gate UNRESOLVED.
// PGLite gives real query semantics for the gate/conversation/scenario reads;
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
  appendTurnEvent,
  getOpenGate,
} from "@burnless/db";
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

  // REAL preset spec the model would have produced via the request_revenue_stream
  // tool — derived from buildInputFormSpec, not hand-rolled.
  const spec = buildInputFormSpec("request_revenue_stream", {
    defaults: { name: "Pro Plan", monthlyAmount: 4900 },
  });

  const turnId = "turn-rev-flow";
  const pauseId = "p-rev-flow";
  // Durable log: user_message → assistant_step (request_revenue_stream) →
  // UNRESOLVED input gate carrying the preset spec + gated tool_use id.
  await appendTurnEvent({ conversationId, turnId, type: "user_message", payload: { text: "help me add a revenue stream" } });
  await appendTurnEvent({
    conversationId, turnId, type: "assistant_step",
    payload: {
      toolUses: [
        { id: INPUT_TOOL_USE_ID, name: "request_revenue_stream", input: { defaults: { name: "Pro Plan", monthlyAmount: 4900 } } },
      ],
    },
  });
  await appendTurnEvent({
    conversationId, turnId, type: "gate",
    payload: {
      pauseId, kind: "input",
      gatedToolUseId: INPUT_TOOL_USE_ID,
      spec,
      scenarioId: scenario.id,
      writeScenarioId: scenario.id,
    },
  });

  return { conversationId, pauseId, spec };
}

describe("input flow — pause → submit → resume (PGLite)", () => {
  beforeEach(() => {
    hoisted.capturedSSEParams = null;
  });

  it("submits the preset form, synthesizes a tool_result, and resolves the open gate", async () => {
    const { conversationId, pauseId } = await seedRevenueStreamPause();

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

    // The open gate is resolved: single-open slot is freed.
    expect(await getOpenGate(conversationId)).toBeNull();
  });

  it("returns 400 and leaves the open gate unresolved when a required field is missing", async () => {
    const { conversationId, pauseId } = await seedRevenueStreamPause();

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

    // Gate stays open so the user can retry.
    expect(hoisted.capturedSSEParams).toBeNull();
    expect(await getOpenGate(conversationId)).not.toBeNull();
  });
});
