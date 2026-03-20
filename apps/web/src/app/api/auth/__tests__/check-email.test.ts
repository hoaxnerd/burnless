import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs before vi.mock hoisting — safe to reference in factory
const { mockSelect, mockFrom, mockWhere, mockLimit } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
  },
  users: { id: "id", email: "email" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { POST } from "../check-email/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/check-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/check-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-chain after clear
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
  });

  it("returns { exists: true } when user exists", async () => {
    mockLimit.mockResolvedValue([{ id: "user-123" }]);

    const res = await POST(jsonRequest({ email: "jane@startup.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.exists).toBe(true);
  });

  it("returns { exists: false } when user does not exist", async () => {
    mockLimit.mockResolvedValue([]);

    const res = await POST(jsonRequest({ email: "new@startup.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.exists).toBe(false);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(jsonRequest({ email: "not-an-email" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid email");
  });

  it("returns 400 for missing email field", async () => {
    const res = await POST(jsonRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid email");
  });

  it("returns 400 for empty string email", async () => {
    const res = await POST(jsonRequest({ email: "" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid email");
  });

  it("returns 400 for non-string email", async () => {
    const res = await POST(jsonRequest({ email: 12345 }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid email");
  });

  it("returns 400 for null body", async () => {
    const res = await POST(jsonRequest(null));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid email");
  });

  it("queries database with the provided email", async () => {
    mockLimit.mockResolvedValue([]);

    await POST(jsonRequest({ email: "test@example.com" }));

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it("handles emails with plus addressing", async () => {
    mockLimit.mockResolvedValue([]);

    const res = await POST(jsonRequest({ email: "user+tag@example.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.exists).toBe(false);
  });

  it("handles emails with subdomains", async () => {
    mockLimit.mockResolvedValue([{ id: "user-456" }]);

    const res = await POST(jsonRequest({ email: "user@mail.example.co.uk" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.exists).toBe(true);
  });
});
