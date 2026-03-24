import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const {
  mockSelect, mockFrom, mockWhere, mockLimit,
  mockUpdate, mockSet, mockUpdateWhere,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
}));

const mockGetAuthUser = vi.hoisted(() => vi.fn());
const mockVerifyTotpCode = vi.hoisted(() => vi.fn());
const mockGenerateTotpSecret = vi.hoisted(() => vi.fn());
const mockBuildTotpUri = vi.hoisted(() => vi.fn());
const mockGenerateBackupCodes = vi.hoisted(() => vi.fn());
const mockHashBackupCodes = vi.hoisted(() => vi.fn());

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  users: {
    id: "id",
    email: "email",
    twoFactorEnabled: "twoFactorEnabled",
    twoFactorSecret: "twoFactorSecret",
    twoFactorBackupCodes: "twoFactorBackupCodes",
  },
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: mockGetAuthUser,
  errorResponse: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  withErrorHandler: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try {
      const data = schema.parse(await req.json());
      return { data };
    } catch {
      return {
        error: new Response(JSON.stringify({ error: "Validation error" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
  },
}));

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/two-factor", () => ({
  generateTotpSecret: mockGenerateTotpSecret,
  buildTotpUri: mockBuildTotpUri,
  verifyTotpCode: mockVerifyTotpCode,
  generateBackupCodes: mockGenerateBackupCodes,
  hashBackupCodes: mockHashBackupCodes,
}));

vi.mock("qrcode", () => ({
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fakeqr"),
}));

// Set up DB mock chains
mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ limit: mockLimit });
mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockUpdateWhere });
mockUpdateWhere.mockResolvedValue(undefined);

// Imports AFTER mocks
import { GET as statusGET } from "../status/route";
import { POST as verifyPOST } from "../verify/route";
import { POST as disablePOST } from "../disable/route";
import { GET as setupGET, POST as setupPOST } from "../setup/route";

function jsonRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

// ─── STATUS ────────────────────────────────────────────────────────
describe("GET /api/auth/two-factor/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await statusGET();
    expect(res.status).toBe(401);
  });

  it("returns enabled: true when 2FA is on", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: true }]);

    const res = await statusGET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.enabled).toBe(true);
  });

  it("returns enabled: false when 2FA is off", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: false }]);

    const res = await statusGET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.enabled).toBe(false);
  });

  it("defaults to false when user not in DB", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([]);

    const res = await statusGET();
    const body = await res.json();
    expect(body.enabled).toBe(false);
  });
});

// ─── VERIFY (public endpoint) ──────────────────────────────────────
describe("POST /api/auth/two-factor/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
  });

  it("returns required: true when user has 2FA enabled", async () => {
    mockLimit.mockResolvedValue([{ twoFactorEnabled: true }]);

    const res = await verifyPOST(
      jsonRequest("http://localhost/api/auth/two-factor/verify", { email: "user@test.com" })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.required).toBe(true);
  });

  it("returns required: false when user has 2FA disabled", async () => {
    mockLimit.mockResolvedValue([{ twoFactorEnabled: false }]);

    const res = await verifyPOST(
      jsonRequest("http://localhost/api/auth/two-factor/verify", { email: "user@test.com" })
    );
    const body = await res.json();
    expect(body.required).toBe(false);
  });

  it("returns required: false when user does not exist", async () => {
    mockLimit.mockResolvedValue([]);

    const res = await verifyPOST(
      jsonRequest("http://localhost/api/auth/two-factor/verify", { email: "nobody@test.com" })
    );
    const body = await res.json();
    expect(body.required).toBe(false);
  });

  it("throws on invalid email format (caught by withErrorHandler in production)", async () => {
    await expect(
      verifyPOST(
        jsonRequest("http://localhost/api/auth/two-factor/verify", { email: "not-an-email" })
      )
    ).rejects.toThrow();
  });
});

// ─── SETUP GET ─────────────────────────────────────────────────────
describe("GET /api/auth/two-factor/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await setupGET(getRequest("http://localhost/api/auth/two-factor/setup"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when 2FA is already enabled", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: true, email: "a@b.com" }]);

    const res = await setupGET(getRequest("http://localhost/api/auth/two-factor/setup"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("already enabled");
  });

  it("generates secret, QR code, and URI on success", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: false, email: "a@b.com" }]);
    mockGenerateTotpSecret.mockReturnValue("JBSWY3DPEHPK3PXP");
    mockBuildTotpUri.mockReturnValue("otpauth://totp/Burnless:a@b.com?secret=JBSWY3DPEHPK3PXP");

    const res = await setupGET(getRequest("http://localhost/api/auth/two-factor/setup"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(body.qrCode).toContain("data:image/png");
    expect(body.uri).toContain("otpauth://totp/");
    expect(mockUpdate).toHaveBeenCalled(); // stores secret in DB
  });
});

// ─── SETUP POST (confirm enrollment) ──────────────────────────────
describe("POST /api/auth/two-factor/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await setupPOST(
      jsonRequest("http://localhost/api/auth/two-factor/setup", { code: "123456" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when 2FA is already enabled", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: true, twoFactorSecret: "secret" }]);

    const res = await setupPOST(
      jsonRequest("http://localhost/api/auth/two-factor/setup", { code: "123456" })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("already enabled");
  });

  it("returns 400 when no setup in progress (no secret)", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: false, twoFactorSecret: null }]);

    const res = await setupPOST(
      jsonRequest("http://localhost/api/auth/two-factor/setup", { code: "123456" })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("No 2FA setup in progress");
  });

  it("returns 400 when code is invalid", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: false, twoFactorSecret: "FAKESECRET" }]);
    mockVerifyTotpCode.mockReturnValue(false);

    const res = await setupPOST(
      jsonRequest("http://localhost/api/auth/two-factor/setup", { code: "000000" })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("Invalid code");
  });

  it("enables 2FA and returns backup codes on valid code", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: false, twoFactorSecret: "FAKESECRET" }]);
    mockVerifyTotpCode.mockReturnValue(true);
    mockGenerateBackupCodes.mockReturnValue(["code1", "code2", "code3"]);
    mockHashBackupCodes.mockResolvedValue(["hash1", "hash2", "hash3"]);

    const res = await setupPOST(
      jsonRequest("http://localhost/api/auth/two-factor/setup", { code: "123456" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.backupCodes).toEqual(["code1", "code2", "code3"]);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects non-6-digit codes", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });

    const res = await setupPOST(
      jsonRequest("http://localhost/api/auth/two-factor/setup", { code: "abc" })
    );
    expect(res.status).toBe(400);
  });
});

// ─── DISABLE ───────────────────────────────────────────────────────
describe("POST /api/auth/two-factor/disable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await disablePOST(
      jsonRequest("http://localhost/api/auth/two-factor/disable", { code: "123456" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when 2FA is not enabled", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: false, twoFactorSecret: null }]);

    const res = await disablePOST(
      jsonRequest("http://localhost/api/auth/two-factor/disable", { code: "123456" })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("not enabled");
  });

  it("returns 400 when code is invalid", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: true, twoFactorSecret: "FAKESECRET" }]);
    mockVerifyTotpCode.mockReturnValue(false);

    const res = await disablePOST(
      jsonRequest("http://localhost/api/auth/two-factor/disable", { code: "123456" })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("Invalid code");
  });

  it("disables 2FA on valid code", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockLimit.mockResolvedValue([{ twoFactorEnabled: true, twoFactorSecret: "FAKESECRET" }]);
    mockVerifyTotpCode.mockReturnValue(true);

    const res = await disablePOST(
      jsonRequest("http://localhost/api/auth/two-factor/disable", { code: "123456" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.disabled).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
