import { it, expect, vi, beforeEach } from "vitest";

const { runOnboardingAgent, getUserCompany } = vi.hoisted(() => ({
  runOnboardingAgent: vi.fn(),
  getUserCompany: vi.fn(),
}));

vi.mock("@/lib/onboarding-agent", () => ({ runOnboardingAgent }));
vi.mock("@/lib/api-rate-limit", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/ai-feature-flags", () => ({
  checkAiFeatureAllowed: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("@/lib/ai-usage-tracker", () => ({ setTrackingCompanyId: vi.fn() }));
// Full stub: importing the real api-helpers pulls in next-auth, which fails to
// resolve next/server under the vitest/happy-dom environment. The route only
// uses these four exports, so stubbing them keeps the assertion intact without
// dragging in the auth chain.
vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  getUserCompany,
  errorResponse: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  withErrorHandler: <T extends (...args: never[]) => Promise<unknown>>(fn: T) => fn,
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getUserCompany.mockResolvedValue({ companyId: "co-1" });
  runOnboardingAgent.mockResolvedValue({
    companyName: "Acme", stage: "", businessModel: "", industry: "",
    founders: [], fundingRounds: [], headcount: [], expenses: [], revenueStreams: [],
  });
});

it("passes the company id to runOnboardingAgent", async () => {
  const req = new Request("http://localhost/api/onboarding/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ websiteUrl: "https://acme.com" }),
  });
  const res = await POST(req);
  // Drain the SSE stream so the ReadableStream start() callback runs to completion.
  await res.text();
  expect(runOnboardingAgent).toHaveBeenCalledWith(
    "https://acme.com", "user-1", expect.any(Function), "co-1",
  );
});

it("passes undefined when there is no company membership", async () => {
  getUserCompany.mockResolvedValue(null);
  const req = new Request("http://localhost/api/onboarding/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ websiteUrl: "https://acme.com" }),
  });
  const res = await POST(req);
  // Drain the SSE stream so the ReadableStream start() callback runs to completion.
  await res.text();
  expect(runOnboardingAgent).toHaveBeenCalledWith(
    "https://acme.com", "user-1", expect.any(Function), undefined,
  );
});
