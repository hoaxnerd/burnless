import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions for vi.mock factory access
const { mockSelect, mockFrom, mockWhere, mockLimit, mockVerifyPassword, mockUpdate, mockSet, mockUpdateWhere } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect, update: mockUpdate },
  users: { id: "id", email: "email", emailVerified: "emailVerified" },
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// Mock verifyPassword — auth.config.ts imports "./password" which resolves to @/lib/password
vi.mock("@/lib/password", () => ({
  verifyPassword: mockVerifyPassword,
}));

// Make NextAuth providers simple passthroughs so authorize is directly accessible
vi.mock("next-auth/providers/credentials", () => ({
  default: (config: any) => ({ id: "credentials", name: "credentials", type: "credentials", ...config }),
}));
vi.mock("next-auth/providers/github", () => ({
  default: { id: "github", name: "github", type: "oauth" },
}));
vi.mock("next-auth/providers/google", () => ({
  default: { id: "google", name: "google", type: "oauth" },
}));

// Chain setup
mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ limit: mockLimit });
mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockUpdateWhere });
mockUpdateWhere.mockResolvedValue(undefined);

import { authConfig } from "../auth.config";

// Extract the credentials provider's authorize function
const credentialsProvider = authConfig.providers.find(
  (p: any) => p.name === "credentials" || p.id === "credentials"
) as any;
const authorize: (credentials: Record<string, unknown>, req: any) => Promise<any> =
  credentialsProvider?.authorize ?? credentialsProvider?.options?.authorize;

describe("auth.config credentials authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  });

  it("returns null when email is missing", async () => {
    const result = await authorize({ password: "test123" }, {} as any);
    expect(result).toBeNull();
  });

  it("returns null when password is missing", async () => {
    const result = await authorize({ email: "test@example.com" }, {} as any);
    expect(result).toBeNull();
  });

  it("returns null when both email and password are missing", async () => {
    const result = await authorize({}, {} as any);
    expect(result).toBeNull();
  });

  it("returns null when user not found in database", async () => {
    mockLimit.mockResolvedValue([]);

    const result = await authorize(
      { email: "nobody@example.com", password: "password123" },
      {} as any
    );
    expect(result).toBeNull();
  });

  it("returns null when user has no passwordHash (OAuth-only user)", async () => {
    mockLimit.mockResolvedValue([
      { id: "u1", email: "oauth@example.com", name: "OAuth", image: null, passwordHash: null },
    ]);

    const result = await authorize(
      { email: "oauth@example.com", password: "password123" },
      {} as any
    );
    expect(result).toBeNull();
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });

  it("returns null when password is incorrect", async () => {
    mockLimit.mockResolvedValue([
      { id: "u1", email: "user@example.com", name: "Test", image: null, passwordHash: "pbkdf2:100000:salt:hash" },
    ]);
    mockVerifyPassword.mockResolvedValue(false);

    const result = await authorize(
      { email: "user@example.com", password: "wrongpass" },
      {} as any
    );
    expect(result).toBeNull();
    expect(mockVerifyPassword).toHaveBeenCalledWith("wrongpass", "pbkdf2:100000:salt:hash");
  });

  it("returns user object on successful authentication", async () => {
    mockLimit.mockResolvedValue([
      {
        id: "u1",
        email: "user@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
        passwordHash: "pbkdf2:100000:salt:hash",
      },
    ]);
    mockVerifyPassword.mockResolvedValue(true);

    const result = await authorize(
      { email: "user@example.com", password: "correctpassword" },
      {} as any
    );
    expect(result).toEqual({
      id: "u1",
      email: "user@example.com",
      name: "Test User",
      image: "https://example.com/avatar.png",
    });
  });

  it("does not leak passwordHash in the returned user object", async () => {
    mockLimit.mockResolvedValue([
      { id: "u1", email: "u@e.com", name: "T", image: null, passwordHash: "pbkdf2:100000:s:h" },
    ]);
    mockVerifyPassword.mockResolvedValue(true);

    const result = await authorize({ email: "u@e.com", password: "correct" }, {} as any);
    expect(result).not.toHaveProperty("passwordHash");
  });
});

describe("auth.config session strategy", () => {
  it("uses JWT strategy", () => {
    expect(authConfig.session?.strategy).toBe("jwt");
  });
});

describe("auth.config pages", () => {
  it("sets signIn page to /login", () => {
    expect(authConfig.pages?.signIn).toBe("/login");
  });

  it("sets newUser page to /onboarding", () => {
    expect(authConfig.pages?.newUser).toBe("/onboarding");
  });
});

describe("auth.config signIn callback — OAuth emailVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("sets emailVerified for Google OAuth users", async () => {
    const result = await (authConfig.callbacks as any).signIn({
      user: { id: "user-1" },
      account: { provider: "google" },
    });
    expect(result).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ emailVerified: expect.any(Date) });
  });

  it("sets emailVerified for GitHub OAuth users", async () => {
    const result = await (authConfig.callbacks as any).signIn({
      user: { id: "user-2" },
      account: { provider: "github" },
    });
    expect(result).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ emailVerified: expect.any(Date) });
  });

  it("does NOT set emailVerified for credentials sign-in", async () => {
    const result = await (authConfig.callbacks as any).signIn({
      user: { id: "user-3" },
      account: { provider: "credentials" },
    });
    expect(result).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips update when user.id is missing", async () => {
    const result = await (authConfig.callbacks as any).signIn({
      user: {},
      account: { provider: "google" },
    });
    expect(result).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("auth.config callbacks", () => {
  it("jwt callback injects user.id into token.sub", async () => {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([{ emailVerified: null }]);

    const token = { sub: undefined as string | undefined };
    const user = { id: "user-123" };
    const result = await authConfig.callbacks!.jwt!({ token, user } as any);
    expect(result).toMatchObject({ sub: "user-123" });
  });

  it("jwt callback preserves existing token when no user", async () => {
    const token = { sub: "existing-id" };
    const result = await authConfig.callbacks!.jwt!({ token, user: undefined } as any);
    expect(result).toMatchObject({ sub: "existing-id" });
  });

  it("session callback injects user id from token.sub", () => {
    const session = { user: { id: undefined as string | undefined } };
    const token = { sub: "user-456" };
    const result = authConfig.callbacks!.session!({ session, token } as any);
    expect((result as any).user.id).toBe("user-456");
  });
});
