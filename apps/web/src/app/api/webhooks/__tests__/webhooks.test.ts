import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockUpdate,
  mockSet,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
}));

const { mockHandleWebhook, mockGetSubscription } = vi.hoisted(() => ({
  mockHandleWebhook: vi.fn(),
  mockGetSubscription: vi.fn(),
}));

const { mockSendEmail } = vi.hoisted(() => ({
  mockSendEmail: vi.fn().mockResolvedValue(undefined),
}));

const { mockLogError, mockLogWarn } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
  mockLogWarn: vi.fn(),
}));

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  companies: {
    id: "id",
    ownerId: "ownerId",
    stripeCustomerId: "stripeCustomerId",
    stripeSubscriptionId: "stripeSubscriptionId",
    stripePlan: "stripePlan",
    billingProvider: "billingProvider",
  },
  users: {
    id: "id",
    email: "email",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: string, val: string) => val),
}));

vi.mock("@/lib/payment", () => ({
  getProviderByType: () => ({
    handleWebhook: mockHandleWebhook,
    getSubscription: mockGetSubscription,
  }),
  planFromPlanId: (id: string | undefined) => {
    if (id === "price_pro") return "pro";
    if (id === "price_team") return "team";
    return "free";
  },
}));

vi.mock("@/lib/email", () => ({
  email: {
    provider: { send: mockSendEmail },
  },
}));

vi.mock("@/lib/email/templates", () => ({
  subscriptionConfirmedEmail: (plan: string) => ({
    subject: `Subscribed to ${plan}`,
    html: "",
  }),
  paymentFailedEmail: () => ({ subject: "Payment failed", html: "" }),
  subscriptionCanceledEmail: () => ({ subject: "Subscription canceled", html: "" }),
}));

vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({
    error: mockLogError,
    warn: mockLogWarn,
    info: vi.fn(),
  }),
}));

// ── Import route under test ─────────────────────────────────────────────────

import { POST } from "../[provider]/route";

// ── Helpers ─────────────────────────────────────────────────────────────────

function webhookRequest(
  provider: string,
  body: string,
  signatureHeader?: string
): [Request, { params: Promise<{ provider: string }> }] {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signatureHeader) {
    if (provider === "stripe") headers["stripe-signature"] = signatureHeader;
    else if (provider === "razorpay") headers["x-razorpay-signature"] = signatureHeader;
  }
  const request = new Request(`http://localhost/api/webhooks/${provider}`, {
    method: "POST",
    headers,
    body,
  });
  return [request, { params: Promise.resolve({ provider }) }];
}

/** Set up the chainable db.select().from().where().limit() mock. */
function setupSelectChain(results: unknown[][]) {
  let callIndex = 0;
  mockSelect.mockImplementation(() => ({ from: mockFrom }));
  mockFrom.mockImplementation(() => ({ where: mockWhere }));
  mockWhere.mockImplementation(() => ({
    limit: () => Promise.resolve(results[callIndex++] ?? []),
  }));
}

/** Set up the chainable db.update().set().where() mock. */
function setupUpdateChain() {
  mockUpdate.mockImplementation(() => ({ set: mockSet }));
  mockSet.mockImplementation(() => ({ where: mockWhere }));
  mockWhere.mockImplementation(() => Promise.resolve());
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/[provider]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUpdateChain();
  });

  // ── Signature verification ──────────────────────────────────────────────

  describe("signature verification", () => {
    it("returns 400 when stripe-signature header is missing", async () => {
      const [req, ctx] = webhookRequest("stripe", "{}");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain("Missing stripe signature header");
    });

    it("returns 400 when razorpay signature header is missing", async () => {
      const [req, ctx] = webhookRequest("razorpay", "{}");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain("Missing razorpay signature header");
    });

    it("returns 400 when signature verification fails", async () => {
      mockHandleWebhook.mockRejectedValue(new Error("Invalid signature"));

      const [req, ctx] = webhookRequest("stripe", "{}", "bad-sig");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("Invalid signature");
    });
  });

  // ── checkout.session.completed ──────────────────────────────────────────

  describe("checkout.session.completed", () => {
    it("updates company billing on valid checkout", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "checkout.session.completed",
        data: {
          customerId: "cus_123",
          subscriptionId: "sub_456",
          metadata: { companyId: "comp-1", userId: "user-1" },
        },
      });
      mockGetSubscription.mockResolvedValue({ planId: "price_pro" });

      // Direction 1: findCompanyByCustomerId → returns matching company
      // Direction 2: lookup claimed company → returns matching
      setupSelectChain([
        [{ id: "comp-1", ownerId: "user-1" }], // findCompanyByCustomerId
        [{ id: "comp-1", stripeCustomerId: "cus_123" }], // claimed company check
        [{ email: "user@test.com" }], // ownerEmail
      ]);

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.received).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("updates company on first checkout (no existing customer)", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "checkout.session.completed",
        data: {
          customerId: "cus_new",
          subscriptionId: "sub_789",
          metadata: { companyId: "comp-2", userId: "user-2" },
        },
      });
      mockGetSubscription.mockResolvedValue(null);

      // No company owns this customer yet; claimed company has no stripeCustomerId
      setupSelectChain([
        [], // findCompanyByCustomerId → no match (new customer)
        [{ id: "comp-2", stripeCustomerId: null }], // claimed company → no existing customer
        [{ email: "owner@test.com" }], // ownerEmail
      ]);

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("REJECTS when customerId belongs to a different company", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "checkout.session.completed",
        data: {
          customerId: "cus_stolen",
          subscriptionId: "sub_evil",
          metadata: { companyId: "comp-attacker", userId: "user-evil" },
        },
      });

      // Direction 1: customerId already belongs to a different company
      setupSelectChain([
        [{ id: "comp-victim", ownerId: "user-victim" }], // findCompanyByCustomerId → different!
      ]);

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(200); // webhook still returns 200 to avoid retries
      expect(body.received).toBe(true);
      // But the update should NOT have been called
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining("webhook rejected")
      );
    });

    it("REJECTS when claimed company already has a different customerId", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "checkout.session.completed",
        data: {
          customerId: "cus_new_evil",
          subscriptionId: "sub_evil",
          metadata: { companyId: "comp-target", userId: "user-1" },
        },
      });

      // Direction 1: no company owns this new customerId
      // Direction 2: but the target company already has a different customer
      setupSelectChain([
        [], // findCompanyByCustomerId → no match
        [{ id: "comp-target", stripeCustomerId: "cus_legitimate" }], // different customer!
      ]);

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining("webhook rejected")
      );
    });

    it("REJECTS when claimed companyId does not exist", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "checkout.session.completed",
        data: {
          customerId: "cus_123",
          subscriptionId: "sub_456",
          metadata: { companyId: "comp-nonexistent", userId: "user-1" },
        },
      });

      setupSelectChain([
        [], // findCompanyByCustomerId → no match
        [], // claimed company → does not exist
      ]);

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining("does not exist")
      );
    });

    it("skips when metadata has no companyId", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "checkout.session.completed",
        data: { customerId: "cus_123", metadata: {} },
      });

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  // ── subscription.updated ────────────────────────────────────────────────

  describe("customer.subscription.updated", () => {
    it("updates plan for known customer", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "customer.subscription.updated",
        data: {
          customerId: "cus_123",
          subscriptionId: "sub_456",
          planId: "price_team",
          cancelAtPeriodEnd: false,
        },
      });

      setupSelectChain([
        [{ id: "comp-1", ownerId: "user-1" }], // findCompanyByCustomerId
      ]);

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("skips if no customerId", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "customer.subscription.updated",
        data: { planId: "price_pro" },
      });

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("skips if customer not found", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "customer.subscription.updated",
        data: { customerId: "cus_unknown", planId: "price_pro" },
      });

      setupSelectChain([[]]);

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  // ── subscription.deleted ────────────────────────────────────────────────

  describe("customer.subscription.deleted", () => {
    it("downgrades to free", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "customer.subscription.deleted",
        data: { customerId: "cus_123" },
      });

      setupSelectChain([
        [{ id: "comp-1", ownerId: "user-1" }],
      ]);

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  // ── payment_failed ──────────────────────────────────────────────────────

  describe("invoice.payment_failed", () => {
    it("sends payment failed email", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "invoice.payment_failed",
        data: { customerId: "cus_123" },
      });

      setupSelectChain([
        [{ id: "comp-1", ownerId: "user-1" }], // findCompanyByCustomerId
        [{ email: "owner@test.com" }], // ownerEmail
      ]);

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(mockSendEmail).toHaveBeenCalled();
    });
  });

  // ── Unknown/other providers ─────────────────────────────────────────────

  describe("other providers", () => {
    it("returns not_implemented for known integration providers", async () => {
      for (const provider of ["quickbooks", "xero", "plaid", "mercury"]) {
        const [req, ctx] = webhookRequest(provider, "{}");
        const res = await POST(req, ctx);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("not_implemented");
      }
    });

    it("returns 404 for unknown provider", async () => {
      const [req, ctx] = webhookRequest("unknown-provider", "{}");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toContain("Unknown provider");
    });
  });

  // ── Unhandled event type ────────────────────────────────────────────────

  describe("unhandled events", () => {
    it("logs a warning for unknown event types", async () => {
      mockHandleWebhook.mockResolvedValue({
        type: "some.unknown.event",
        data: {},
      });

      const [req, ctx] = webhookRequest("stripe", "{}", "valid-sig");
      const res = await POST(req, ctx);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.type).toBe("some.unknown.event");
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining("Unhandled")
      );
    });
  });
});
