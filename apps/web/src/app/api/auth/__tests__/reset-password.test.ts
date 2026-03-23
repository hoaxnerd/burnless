import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSelect, mockFrom, mockWhere, mockLimit,
  mockUpdate, mockSet,
  mockDelete,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  },
  users: { id: "id", email: "email", passwordHash: "passwordHash" },
  verificationTokens: { identifier: "identifier", token: "token", expires: "expires" },
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("pbkdf2:hashed"),
}));

import { POST } from "../reset-password/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: "founder@startup.com",
  token: "valid-token-hex",
  password: "NewSecure1",
};

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Select chain: db.select().from().where().limit()
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    // mockWhere needs to serve both select chains (returning { limit }) and
    // update/delete chains (terminal, resolves as promise).
    // We make it return an object with limit, but also be thenable for terminal ops.
    mockWhere.mockReturnValue({
      limit: mockLimit,
      returning: vi.fn().mockResolvedValue([]),
      then: (resolve: (v: unknown) => void) => Promise.resolve().then(resolve),
      catch: () => Promise.resolve(),
    });
    // Update chain: db.update().set().where()
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    // Delete chain: db.delete().where()
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("returns 200 and resets password with valid token", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "founder@startup.com", token: "valid-token-hex", expires: futureDate },
    ]);

    const res = await POST(jsonRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe("Password reset successfully.");
  });

  it("hashes the new password before storing", async () => {
    const { hashPassword } = await import("@/lib/password");
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "founder@startup.com", token: "valid-token-hex", expires: futureDate },
    ]);

    await POST(jsonRequest(validBody));

    expect(hashPassword).toHaveBeenCalledWith("NewSecure1");
  });

  it("updates user password in database", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "founder@startup.com", token: "valid-token-hex", expires: futureDate },
    ]);

    await POST(jsonRequest(validBody));

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: "pbkdf2:hashed",
      })
    );
  });

  it("deletes tokens after successful reset", async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "founder@startup.com", token: "valid-token-hex", expires: futureDate },
    ]);

    await POST(jsonRequest(validBody));

    // Delete is called to clean up tokens
    expect(mockDelete).toHaveBeenCalled();
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(
      jsonRequest({ email: "not-an-email", token: "abc", password: "NewSecure1" })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 for missing fields", async () => {
    const res = await POST(jsonRequest({ email: "founder@startup.com" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("returns 400 for password without uppercase", async () => {
    const res = await POST(
      jsonRequest({
        email: "founder@startup.com",
        token: "valid-token",
        password: "alllower1",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("uppercase");
  });

  it("returns 400 for password without lowercase", async () => {
    const res = await POST(
      jsonRequest({
        email: "founder@startup.com",
        token: "valid-token",
        password: "ALLUPPER1",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("lowercase");
  });

  it("returns 400 for password without a number", async () => {
    const res = await POST(
      jsonRequest({
        email: "founder@startup.com",
        token: "valid-token",
        password: "NoNumbers",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("number");
  });

  it("returns 400 for password too short", async () => {
    const res = await POST(
      jsonRequest({
        email: "founder@startup.com",
        token: "valid-token",
        password: "Short1",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("8 characters");
  });

  it("returns 400 for invalid/expired token (not found)", async () => {
    mockLimit.mockResolvedValue([]);

    const res = await POST(jsonRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid or expired");
  });

  it("returns 400 for expired token and cleans up", async () => {
    const pastDate = new Date(Date.now() - 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "founder@startup.com", token: "valid-token-hex", expires: pastDate },
    ]);

    const res = await POST(jsonRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("expired");
    // Should clean up the expired token
    expect(mockDelete).toHaveBeenCalled();
  });

  it("does not update password when token is not found", async () => {
    mockLimit.mockResolvedValue([]);

    await POST(jsonRequest(validBody));

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("does not update password when token is expired", async () => {
    const pastDate = new Date(Date.now() - 3600_000);
    mockLimit.mockResolvedValue([
      { identifier: "founder@startup.com", token: "valid-token-hex", expires: pastDate },
    ]);

    await POST(jsonRequest(validBody));

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
