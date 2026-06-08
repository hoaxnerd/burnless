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
  users: { id: "id", email: "email", emailVerified: "emailVerified", name: "name", image: "image" },
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
  default: (config: Record<string, unknown>) => ({ id: "credentials", name: "credentials", type: "credentials", ...config }),
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
  (p: unknown) => (p as { name?: string }).name === "credentials" || (p as { id?: string }).id === "credentials"
) as { authorize?: (credentials: Record<string, unknown>, req: unknown) => Promise<unknown>; options?: { authorize?: (credentials: Record<string, unknown>, req: unknown) => Promise<unknown> } };
const authorize: (credentials: Record<string, unknown>, req: unknown) => Promise<unknown> =
  (credentialsProvider?.authorize ?? credentialsProvider?.options?.authorize) as (credentials: Record<string, unknown>, req: unknown) => Promise<unknown>;

describe("auth.config credentials authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  });

  it("returns null when email is missing", async () => {
    const result = await authorize({ password: "test123" }, {});
    expect(result).toBeNull();
  });

  it("returns null when password is missing", async () => {
    const result = await authorize({ email: "test@example.com" }, {});
    expect(result).toBeNull();
  });

  it("returns null when both email and password are missing", async () => {
    const result = await authorize({}, {});
    expect(result).toBeNull();
  });

  it("returns null when user not found in database", async () => {
    mockLimit.mockResolvedValue([]);

    const result = await authorize(
      { email: "nobody@example.com", password: "password123" },
      {}
    );
    expect(result).toBeNull();
  });

  it("returns null when user has no passwordHash (OAuth-only user)", async () => {
    mockLimit.mockResolvedValue([
      { id: "u1", email: "oauth@example.com", name: "OAuth", image: null, passwordHash: null },
    ]);

    const result = await authorize(
      { email: "oauth@example.com", password: "password123" },
      {}
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
      {}
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
      {}
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

    const result = await authorize({ email: "u@e.com", password: "correct" }, {});
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
    const result = await (authConfig.callbacks as unknown as { signIn: (args: { user: { id: string }; account: { provider: string } }) => Promise<boolean> }).signIn({
      user: { id: "user-1" },
      account: { provider: "google" },
    });
    expect(result).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ emailVerified: expect.any(Date) });
  });

  it("sets emailVerified for GitHub OAuth users", async () => {
    const result = await (authConfig.callbacks as unknown as { signIn: (args: { user: { id: string }; account: { provider: string } }) => Promise<boolean> }).signIn({
      user: { id: "user-2" },
      account: { provider: "github" },
    });
    expect(result).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ emailVerified: expect.any(Date) });
  });

  it("does NOT set emailVerified for credentials sign-in", async () => {
    const result = await (authConfig.callbacks as unknown as { signIn: (args: { user: { id: string }; account: { provider: string } }) => Promise<boolean> }).signIn({
      user: { id: "user-3" },
      account: { provider: "credentials" },
    });
    expect(result).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips update when user.id is missing", async () => {
    const result = await (authConfig.callbacks as unknown as { signIn: (args: { user: Record<string, unknown>; account: { provider: string } }) => Promise<boolean> }).signIn({
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
    const result = await authConfig.callbacks!.jwt!({ token, user } as unknown as Parameters<NonNullable<typeof authConfig.callbacks>["jwt"]>[0]);
    expect(result).toMatchObject({ sub: "user-123" });
  });

  it("jwt callback preserves existing token when no user", async () => {
    const token = { sub: "existing-id" };
    const result = await authConfig.callbacks!.jwt!({ token, user: undefined } as unknown as Parameters<NonNullable<typeof authConfig.callbacks>["jwt"]>[0]);
    expect(result).toMatchObject({ sub: "existing-id" });
  });

  // ── RPT-12: name/picture refresh on trigger 'update' ─────────────────────
  it("jwt callback refreshes token.name + token.picture on trigger 'update'", async () => {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([
      { emailVerified: new Date(), name: "Morgan Pro", image: "https://example.com/new.png" },
    ]);

    const token = { sub: "user-1", name: "N", picture: null, customField: "keep-me" };
    const result = await authConfig.callbacks!.jwt!({ token, trigger: "update" } as unknown as Parameters<NonNullable<typeof authConfig.callbacks>["jwt"]>[0]) as Record<string, unknown>;

    expect(result.name).toBe("Morgan Pro");
    expect(result.picture).toBe("https://example.com/new.png");
    // Existing unrelated fields preserved.
    expect(result.sub).toBe("user-1");
    expect(result.customField).toBe("keep-me");
    expect(result.isEmailVerified).toBe(true);
  });

  it("jwt callback does NOT overwrite name/picture when the DB row is not found", async () => {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]); // no row

    const token = { sub: "user-1", name: "Existing", picture: "https://example.com/keep.png" };
    const result = await authConfig.callbacks!.jwt!({ token, trigger: "update" } as unknown as Parameters<NonNullable<typeof authConfig.callbacks>["jwt"]>[0]) as Record<string, unknown>;

    expect(result.name).toBe("Existing");
    expect(result.picture).toBe("https://example.com/keep.png");
  });

  it("jwt callback does NOT hit the DB on a plain request (no user, no update trigger)", async () => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });

    const token = { sub: "user-1", name: "Existing" };
    await authConfig.callbacks!.jwt!({ token } as unknown as Parameters<NonNullable<typeof authConfig.callbacks>["jwt"]>[0]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("session callback injects user id from token.sub", () => {
    const session = { user: { id: undefined as string | undefined } };
    const token = { sub: "user-456" };
    const result = authConfig.callbacks!.session!({ session, token } as unknown as Parameters<NonNullable<typeof authConfig.callbacks>["session"]>[0]);
    expect((result as unknown as { user: { id: string } }).user.id).toBe("user-456");
  });
});
