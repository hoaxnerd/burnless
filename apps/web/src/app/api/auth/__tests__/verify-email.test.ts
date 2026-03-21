import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSelect, mockFrom, mockWhere, mockLimit,
  mockUpdate, mockSet, mockReturning,
  mockDelete,
  mockSend,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockReturning: vi.fn(),
  mockDelete: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  },
  users: { id: "id", email: "email", name: "name", emailVerified: "emailVerified" },
  verificationTokens: { identifier: "identifier", token: "token", expires: "expires" },
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@/lib/email", () => ({
  email: { provider: { send: mockSend } },
}));

vi.mock("@/lib/email/templates", () => ({
  welcomeEmail: vi.fn().mockReturnValue({ subject: "Welcome", html: "<p>Welcome</p>" }),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { POST } from "../verify-email/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: "founder@startup.com",
  token: "valid-verify-token",
};

describe("POST /api/auth/verify-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Select chain: db.select().from().where().limit()
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    // Update chain: db.update().set().where().returning()
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mockReturning,
      }),
    });
    // Delete chain: db.delete().where() — terminal, resolves as promise
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockSend.mockResolvedValue(undefined);
  });

  it("returns 200 and verifies email with valid token", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "verify:founder@startup.com", token: "valid-verify-token", expires: futureDate },
    ]);
    mockReturning.mockResolvedValue([
      { id: "user-1", name: "Founder", email: "founder@startup.com" },
    ]);

    const res = await POST(jsonRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe("Email verified successfully");
  });

  it("updates user emailVerified field", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "verify:founder@startup.com", token: "valid-verify-token", expires: futureDate },
    ]);
    mockReturning.mockResolvedValue([
      { id: "user-1", name: "Founder", email: "founder@startup.com" },
    ]);

    await POST(jsonRequest(validBody));

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        emailVerified: expect.any(Date),
      })
    );
  });

  it("cleans up verification tokens after successful verification", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "verify:founder@startup.com", token: "valid-verify-token", expires: futureDate },
    ]);
    mockReturning.mockResolvedValue([
      { id: "user-1", name: "Founder", email: "founder@startup.com" },
    ]);

    await POST(jsonRequest(validBody));

    expect(mockDelete).toHaveBeenCalled();
  });

  it("sends welcome email after verification", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "verify:founder@startup.com", token: "valid-verify-token", expires: futureDate },
    ]);
    mockReturning.mockResolvedValue([
      { id: "user-1", name: "Founder", email: "founder@startup.com" },
    ]);

    await POST(jsonRequest(validBody));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "founder@startup.com",
        subject: "Welcome",
        html: "<p>Welcome</p>",
      })
    );
  });

  it("returns 400 for invalid/missing token (not found in DB)", async () => {
    mockLimit.mockResolvedValue([]);

    const res = await POST(jsonRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid or expired");
  });

  it("returns 400 for expired token", async () => {
    const pastDate = new Date(Date.now() - 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "verify:founder@startup.com", token: "valid-verify-token", expires: pastDate },
    ]);

    const res = await POST(jsonRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("expired");
  });

  it("cleans up expired token on expiry check", async () => {
    const pastDate = new Date(Date.now() - 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "verify:founder@startup.com", token: "valid-verify-token", expires: pastDate },
    ]);

    await POST(jsonRequest(validBody));

    expect(mockDelete).toHaveBeenCalled();
  });

  it("does not update user when token is expired", async () => {
    const pastDate = new Date(Date.now() - 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "verify:founder@startup.com", token: "valid-verify-token", expires: pastDate },
    ]);

    await POST(jsonRequest(validBody));

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when user not found after token valid", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "verify:founder@startup.com", token: "valid-verify-token", expires: futureDate },
    ]);
    // No user returned from update
    mockReturning.mockResolvedValue([]);

    const res = await POST(jsonRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("User not found");
  });

  it("returns 400 for missing email field", async () => {
    const res = await POST(jsonRequest({ token: "some-token" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 for missing token field", async () => {
    const res = await POST(jsonRequest({ email: "founder@startup.com" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(jsonRequest({ email: "not-an-email", token: "abc" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("does not send welcome email when token is invalid", async () => {
    mockLimit.mockResolvedValue([]);

    await POST(jsonRequest(validBody));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not send welcome email when user not found", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "verify:founder@startup.com", token: "valid-verify-token", expires: futureDate },
    ]);
    mockReturning.mockResolvedValue([]);

    await POST(jsonRequest(validBody));

    expect(mockSend).not.toHaveBeenCalled();
  });
});
