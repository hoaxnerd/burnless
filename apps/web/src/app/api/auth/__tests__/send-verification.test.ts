import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSelect, mockFrom, mockWhere, mockLimit,
  mockInsert, mockValues,
  mockDelete,
  mockSend,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockDelete: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  },
  users: { id: "id", email: "email", emailVerified: "emailVerified" },
  verificationTokens: { identifier: "identifier", token: "token", expires: "expires" },
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/email", () => ({
  email: { provider: { send: mockSend } },
}));

vi.mock("@/lib/email/templates", () => ({
  verificationEmail: vi.fn().mockReturnValue({ subject: "Verify", html: "<p>Verify</p>" }),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { POST } from "../send-verification/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/send-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/send-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Select chain: db.select().from().where().limit()
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    // Delete chain: db.delete().where() — terminal, resolves as promise
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    // Insert chain: db.insert().values() — terminal, resolves as promise
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({
      then: (cb: (v: unknown) => void) => Promise.resolve().then(cb),
      catch: () => Promise.resolve(),
    });
    mockSend.mockResolvedValue(undefined);
  });

  it("returns 200 when user exists and is not verified", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "founder@startup.com", emailVerified: null },
    ]);

    const res = await POST(jsonRequest({ email: "founder@startup.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe(
      "If an account exists with that email, a verification link has been sent."
    );
  });

  it("returns 200 when user does not exist (anti-enumeration)", async () => {
    mockLimit.mockResolvedValue([]);

    const res = await POST(jsonRequest({ email: "nobody@example.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe(
      "If an account exists with that email, a verification link has been sent."
    );
  });

  it("returns 200 when user is already verified", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "verified@startup.com", emailVerified: new Date() },
    ]);

    const res = await POST(jsonRequest({ email: "verified@startup.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe(
      "If an account exists with that email, a verification link has been sent."
    );
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(jsonRequest({ email: "not-an-email" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid email");
  });

  it("returns 400 for missing email", async () => {
    const res = await POST(jsonRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid email");
  });

  it("sends verification email for unverified user", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "founder@startup.com", emailVerified: null },
    ]);

    await POST(jsonRequest({ email: "founder@startup.com" }));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "founder@startup.com",
        subject: "Verify",
        html: "<p>Verify</p>",
      })
    );
  });

  it("does not send email when user does not exist", async () => {
    mockLimit.mockResolvedValue([]);

    await POST(jsonRequest({ email: "nobody@example.com" }));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not send email when user is already verified", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "verified@startup.com", emailVerified: new Date() },
    ]);

    await POST(jsonRequest({ email: "verified@startup.com" }));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("cleans up old tokens before inserting new one", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "founder@startup.com", emailVerified: null },
    ]);

    await POST(jsonRequest({ email: "founder@startup.com" }));

    // Delete old tokens, then insert new one
    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });

  it("does not insert token when user does not exist", async () => {
    mockLimit.mockResolvedValue([]);

    await POST(jsonRequest({ email: "nobody@example.com" }));

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("inserts token with verify: prefix identifier", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "founder@startup.com", emailVerified: null },
    ]);

    await POST(jsonRequest({ email: "founder@startup.com" }));

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "verify:founder@startup.com",
        token: expect.any(String),
        expires: expect.any(Date),
      })
    );
  });

  it("normalizes email to lowercase", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "founder@startup.com", emailVerified: null },
    ]);

    await POST(jsonRequest({ email: "Founder@Startup.COM" }));

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "verify:founder@startup.com",
      })
    );
  });
});
