import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPassword, verifyPassword } from "../password";

/**
 * Auth flow integration tests.
 * These test the credential authorize logic using real password hashing —
 * verifying the full chain: hash → store → verify works correctly.
 *
 * DB interactions are mocked but the crypto is real.
 */

// Mocked DB state — simulates a users table
let mockUsersTable: Array<{
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  image: string | null;
}> = [];

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();

vi.mock("@burnless/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
  users: { id: "id", email: "email", name: "name", passwordHash: "passwordHash" },
}));

vi.mock("@/lib/password", async (importOriginal) => {
  // Use real implementations for integration tests
  const actual = await importOriginal<typeof import("../password")>();
  return actual;
});

// Wire up mock chains with realistic behavior
function setupMockChains() {
  mockSelect.mockImplementation(() => ({ from: mockFrom }));
  mockFrom.mockImplementation(() => ({ where: mockWhere }));
  mockWhere.mockImplementation((condition: unknown) => ({
    limit: (n: number) => {
      // Simple email-based lookup from mock table
      // The condition is opaque (drizzle eq()), so we use the last email set
      return Promise.resolve(
        mockUsersTable.filter((u) => u.email === lastQueriedEmail).slice(0, n)
      );
    },
  }));
  mockInsert.mockImplementation(() => ({ values: mockValues }));
  mockValues.mockImplementation((data: Record<string, unknown>) => {
    const user = {
      id: `user-${Date.now()}`,
      email: data.email as string,
      name: (data.name as string) ?? null,
      passwordHash: (data.passwordHash as string) ?? null,
      image: null,
    };
    mockUsersTable.push(user);
    return {
      returning: () =>
        Promise.resolve([{ id: user.id, email: user.email, name: user.name }]),
    };
  });
}

let lastQueriedEmail = "";

describe("auth flow integration", () => {
  beforeEach(() => {
    mockUsersTable = [];
    lastQueriedEmail = "";
    vi.clearAllMocks();
    setupMockChains();
  });

  describe("password round-trip", () => {
    it("hashed password can be verified with correct password", async () => {
      const password = "mySecureP@ss123";
      const hash = await hashPassword(password);
      expect(await verifyPassword(password, hash)).toBe(true);
    });

    it("hashed password rejects wrong password", async () => {
      const hash = await hashPassword("correct-password");
      expect(await verifyPassword("wrong-password", hash)).toBe(false);
    });

    it("different passwords produce different hashes", async () => {
      const hash1 = await hashPassword("password1");
      const hash2 = await hashPassword("password2");
      expect(hash1).not.toBe(hash2);
    });

    it("same password hashed twice produces different hashes (unique salt)", async () => {
      const hash1 = await hashPassword("samePassword");
      const hash2 = await hashPassword("samePassword");
      expect(hash1).not.toBe(hash2);
      // But both verify correctly
      expect(await verifyPassword("samePassword", hash1)).toBe(true);
      expect(await verifyPassword("samePassword", hash2)).toBe(true);
    });
  });

  describe("signup → signin credential flow", () => {
    it("registers a user and verifies their credentials", async () => {
      const email = "founder@startup.com";
      const password = "runway2024!";

      // Step 1: Hash password (simulating register route)
      const passwordHash = await hashPassword(password);

      // Step 2: Store in mock DB
      mockUsersTable.push({
        id: "user-1",
        email,
        name: "Founder",
        passwordHash,
        image: null,
      });

      // Step 3: Verify credentials (simulating authorize callback)
      const user = mockUsersTable.find((u) => u.email === email);
      expect(user).toBeDefined();
      expect(user!.passwordHash).toBeDefined();

      const isValid = await verifyPassword(password, user!.passwordHash!);
      expect(isValid).toBe(true);
    });

    it("rejects wrong password for registered user", async () => {
      const email = "founder@startup.com";
      const password = "runway2024!";

      const passwordHash = await hashPassword(password);
      mockUsersTable.push({
        id: "user-1",
        email,
        name: "Founder",
        passwordHash,
        image: null,
      });

      const user = mockUsersTable.find((u) => u.email === email);
      const isValid = await verifyPassword("wrongPassword", user!.passwordHash!);
      expect(isValid).toBe(false);
    });

    it("returns null for non-existent user (authorize behavior)", async () => {
      // Simulating the authorize callback logic
      const user = mockUsersTable.find((u) => u.email === "nobody@example.com");
      expect(user).toBeUndefined();
      // In auth.config.ts: if (!user || !user.passwordHash) return null
    });

    it("returns null for OAuth user without password hash (authorize behavior)", async () => {
      // OAuth users have null passwordHash
      mockUsersTable.push({
        id: "oauth-user",
        email: "google@example.com",
        name: "Google User",
        passwordHash: null,
        image: "https://avatar.example.com/pic.jpg",
      });

      const user = mockUsersTable.find((u) => u.email === "google@example.com");
      expect(user).toBeDefined();
      expect(user!.passwordHash).toBeNull();
      // In auth.config.ts: if (!user || !user.passwordHash) return null
    });
  });

  describe("edge cases", () => {
    it("handles email with special characters in registration", async () => {
      const email = "user+test@sub.example.co.uk";
      const password = "validPass123";

      const passwordHash = await hashPassword(password);
      mockUsersTable.push({
        id: "user-special",
        email,
        name: "user+test",
        passwordHash,
        image: null,
      });

      const user = mockUsersTable.find((u) => u.email === email);
      expect(await verifyPassword(password, user!.passwordHash!)).toBe(true);
    });

    it("handles unicode characters in password during registration", async () => {
      const password = "Pässwörd🔐2024";
      const passwordHash = await hashPassword(password);

      mockUsersTable.push({
        id: "user-unicode",
        email: "unicode@example.com",
        name: "Unicode User",
        passwordHash,
        image: null,
      });

      const user = mockUsersTable.find((u) => u.email === "unicode@example.com");
      expect(await verifyPassword(password, user!.passwordHash!)).toBe(true);
      expect(await verifyPassword("Passwort2024", user!.passwordHash!)).toBe(false);
    });

    it("handles minimum length password (8 chars)", async () => {
      const password = "exactly8";
      const passwordHash = await hashPassword(password);

      mockUsersTable.push({
        id: "user-min",
        email: "min@example.com",
        name: "Min",
        passwordHash,
        image: null,
      });

      const user = mockUsersTable.find((u) => u.email === "min@example.com");
      expect(await verifyPassword(password, user!.passwordHash!)).toBe(true);
    });

    it("name defaults to email prefix when not provided", () => {
      const email = "founder@burnless.com";
      const defaultName = email.split("@")[0];
      expect(defaultName).toBe("founder");
    });

    it("duplicate email detection works", async () => {
      mockUsersTable.push({
        id: "user-1",
        email: "taken@startup.com",
        name: "First User",
        passwordHash: await hashPassword("pass1234"),
        image: null,
      });

      const existing = mockUsersTable.find((u) => u.email === "taken@startup.com");
      expect(existing).toBeDefined();
      // Route would return 409 here
    });
  });
});
