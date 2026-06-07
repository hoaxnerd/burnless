// apps/web/src/lib/ai-tools/__tests__/genui-data-to-llm.test.ts
import { describe, it, expect, vi } from "vitest";

// Break the next-auth / next-cache import chain that compute-dashboard pulls in
// transitively (mirrors scenario-read-path.test.ts), while keeping REAL DB compute.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import "@db-test/setup";
import { createUser, createCompany, createScenario, createRevenueStream } from "@db-test/factories";
import { genuiDisplayHandlers } from "../genui-display";

async function seed() {
  const user = await createUser();
  const company = await createCompany(user.id);
  const scenario = await createScenario(company.id, { name: "Base", source: "blank", status: "active" });
  await createRevenueStream(company.id, { name: "Pro", parameters: { subscription: { startingCustomers: 100, monthlyPrice: 50 } } } as never);
  return { company, scenario, user };
}

describe("data-bound display tools feed real numbers to the model", () => {
  it("show_runway modelResult carries the net-burn figure the model can interpret", async () => {
    const { company, scenario, user } = await seed();
    const out = await genuiDisplayHandlers.show_runway!({}, { companyId: company.id, scenarioId: scenario.id, userId: user.id });
    const parsed = JSON.parse(out) as { modelResult: string; render?: unknown };
    expect(parsed.render).toBeTruthy();
    // RED: today's runway modelResult is `[runway shown: N months, cash-out M]` — it
    // has digits but NO burn figure. The enrichment must add net burn (+ cash), so
    // assert on a token the current string lacks. This genuinely fails before Step 5.4.
    expect(parsed.modelResult).toMatch(/burn/i);
  });
});
