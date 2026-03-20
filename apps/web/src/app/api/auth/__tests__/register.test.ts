import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions so vi.mock factories can reference them
const {
  mockSelect, mockFrom, mockWhere, mockLimit,
  mockInsert, mockValues, mockReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
  users: { id: "id", email: "email", name: "name" },
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// Mock password hashing to avoid crypto overhead in tests
vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("pbkdf2:100000:fakesalt:fakehash"),
}));

// Chain: db.select(...).from(...).where(...).limit(1)
mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ limit: mockLimit });

// Chain: db.insert(users).values(...).returning(...)
mockInsert.mockReturnValue({ values: mockValues });
mockValues.mockReturnValue({ returning: mockReturning });

import { POST } from "../register/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup chains after clearAllMocks
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  describe("successful registration", () => {
    beforeEach(() => {
      // No existing user
      mockLimit.mockResolvedValue([]);
      // Successful insert
      mockReturning.mockResolvedValue([
        { id: "new-user-id", email: "jane@startup.com", name: "Jane" },
      ]);
    });

    it("creates user and returns 201", async () => {
      const res = await POST(
        jsonRequest({
          email: "jane@startup.com",
          password: "securepass123",
          name: "Jane",
        })
      );
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.id).toBe("new-user-id");
      expect(data.email).toBe("jane@startup.com");
      expect(data.name).toBe("Jane");
    });

    it("uses email prefix as name when name is not provided", async () => {
      mockReturning.mockResolvedValue([
        { id: "new-user-id", email: "founder@startup.com", name: "founder" },
      ]);

      const res = await POST(
        jsonRequest({
          email: "founder@startup.com",
          password: "securepass123",
        })
      );

      expect(res.status).toBe(201);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "founder@startup.com",
          name: "founder",
        })
      );
    });

    it("hashes the password before storing", async () => {
      const { hashPassword } = await import("@/lib/password");

      await POST(
        jsonRequest({
          email: "jane@startup.com",
          password: "securepass123",
          name: "Jane",
        })
      );

      expect(hashPassword).toHaveBeenCalledWith("securepass123");
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordHash: "pbkdf2:100000:fakesalt:fakehash",
        })
      );
    });
  });

  describe("duplicate email", () => {
    it("returns 409 when email already exists", async () => {
      mockLimit.mockResolvedValue([{ id: "existing-user" }]);

      const res = await POST(
        jsonRequest({
          email: "taken@startup.com",
          password: "securepass123",
          name: "Someone",
        })
      );
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toBe("An account with this email already exists");
    });

    it("does not attempt insert when email exists", async () => {
      mockLimit.mockResolvedValue([{ id: "existing-user" }]);

      await POST(
        jsonRequest({
          email: "taken@startup.com",
          password: "securepass123",
        })
      );

      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe("validation errors", () => {
    it("returns 400 for invalid email format", async () => {
      const res = await POST(
        jsonRequest({
          email: "not-an-email",
          password: "securepass123",
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it("returns 400 for missing email", async () => {
      const res = await POST(
        jsonRequest({
          password: "securepass123",
        })
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 for password shorter than 8 characters", async () => {
      const res = await POST(
        jsonRequest({
          email: "jane@startup.com",
          password: "short",
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it("returns 400 for missing password", async () => {
      const res = await POST(
        jsonRequest({
          email: "jane@startup.com",
        })
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 for empty body", async () => {
      const res = await POST(jsonRequest({}));
      expect(res.status).toBe(400);
    });

    it("returns 400 for null body", async () => {
      const res = await POST(jsonRequest(null));
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty name string", async () => {
      const res = await POST(
        jsonRequest({
          email: "jane@startup.com",
          password: "securepass123",
          name: "",
        })
      );

      expect(res.status).toBe(400);
    });

    it("accepts exactly 8-character password (boundary)", async () => {
      mockLimit.mockResolvedValue([]);
      mockReturning.mockResolvedValue([
        { id: "id", email: "jane@startup.com", name: "Jane" },
      ]);

      const res = await POST(
        jsonRequest({
          email: "jane@startup.com",
          password: "exactly8",
          name: "Jane",
        })
      );

      expect(res.status).toBe(201);
    });

    it("rejects 7-character password (boundary)", async () => {
      const res = await POST(
        jsonRequest({
          email: "jane@startup.com",
          password: "seven77",
        })
      );

      expect(res.status).toBe(400);
    });
  });

  describe("response shape", () => {
    it("does not leak password hash in response", async () => {
      mockLimit.mockResolvedValue([]);
      mockReturning.mockResolvedValue([
        { id: "user-1", email: "jane@startup.com", name: "Jane" },
      ]);

      const res = await POST(
        jsonRequest({
          email: "jane@startup.com",
          password: "securepass123",
          name: "Jane",
        })
      );
      const data = await res.json();

      expect(data.passwordHash).toBeUndefined();
      expect(data.password).toBeUndefined();
    });

    it("returns only id, email, and name", async () => {
      mockLimit.mockResolvedValue([]);
      mockReturning.mockResolvedValue([
        { id: "user-1", email: "jane@startup.com", name: "Jane" },
      ]);

      const res = await POST(
        jsonRequest({
          email: "jane@startup.com",
          password: "securepass123",
          name: "Jane",
        })
      );
      const data = await res.json();

      expect(Object.keys(data).sort()).toEqual(["email", "id", "name"]);
    });
  });
});
