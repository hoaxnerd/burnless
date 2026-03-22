import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSelect, mockFrom, mockWhere, mockLimit,
  mockInsert, mockValues,
  mockSend,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
  users: { id: "id", email: "email", passwordHash: "passwordHash" },
  verificationTokens: { identifier: "identifier", token: "token", expires: "expires" },
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/email", () => ({
  email: { provider: { send: mockSend } },
}));

vi.mock("@/lib/email/templates", () => ({
  passwordResetEmail: vi.fn().mockReturnValue({ subject: "Reset", html: "<p>Reset</p>" }),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { POST } from "../forgot-password/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-chain DB mocks
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({
      then: (cb: (v: unknown) => void) => Promise.resolve().then(cb),
      catch: () => Promise.resolve(),
    });
    mockSend.mockResolvedValue(undefined);
  });

  it("returns 200 with standard message when user exists (anti-enumeration)", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "founder@startup.com", passwordHash: "pbkdf2:hashed" },
    ]);

    const res = await POST(jsonRequest({ email: "founder@startup.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe(
      "If an account exists with that email, a reset link has been sent."
    );
  });

  it("returns 200 with same message when user does NOT exist", async () => {
    mockLimit.mockResolvedValue([]);

    const res = await POST(jsonRequest({ email: "nobody@example.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe(
      "If an account exists with that email, a reset link has been sent."
    );
  });

  it("returns 200 when user is OAuth-only (no passwordHash)", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-2", email: "oauth@startup.com", passwordHash: null },
    ]);

    const res = await POST(jsonRequest({ email: "oauth@startup.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe(
      "If an account exists with that email, a reset link has been sent."
    );
  });

  it("returns 400 for invalid email format", async () => {
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

  it("inserts verification token when user exists", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "founder@startup.com", passwordHash: "pbkdf2:hashed" },
    ]);

    await POST(jsonRequest({ email: "founder@startup.com" }));

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "founder@startup.com",
        token: expect.any(String),
        expires: expect.any(Date),
      })
    );
  });

  it("does not insert token when user does not exist", async () => {
    mockLimit.mockResolvedValue([]);

    await POST(jsonRequest({ email: "nobody@example.com" }));

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does not insert token when user is OAuth-only", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-2", email: "oauth@startup.com", passwordHash: null },
    ]);

    await POST(jsonRequest({ email: "oauth@startup.com" }));

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("sends password reset email when user exists", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "founder@startup.com", passwordHash: "pbkdf2:hashed" },
    ]);

    await POST(jsonRequest({ email: "founder@startup.com" }));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "founder@startup.com",
        subject: "Reset",
        html: "<p>Reset</p>",
      })
    );
  });

  it("does not send email when user does not exist", async () => {
    mockLimit.mockResolvedValue([]);

    await POST(jsonRequest({ email: "nobody@example.com" }));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("normalizes email to lowercase", async () => {
    mockLimit.mockResolvedValue([
      { id: "user-1", email: "founder@startup.com", passwordHash: "pbkdf2:hashed" },
    ]);

    await POST(jsonRequest({ email: "Founder@Startup.COM" }));

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "founder@startup.com",
      })
    );
  });
});
