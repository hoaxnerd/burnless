/**
 * Dashboard layout onboarding gate — the INVERSE of the /onboarding guard
 * (ONB-01), kept symmetric with it (see onboarding/layout.tsx).
 *
 * - No session                          → redirect('/login')
 * - cloud, no company                   → redirect('/onboarding')
 * - cloud, has company                  → renders {children}
 * - self-host, UNCLAIMED install company → redirect('/onboarding')  (so the user
 *   is sent into the wizard to claim the boot-created placeholder — without this
 *   the install-company would let a fresh self-host user bypass onboarding)
 * - self-host, CLAIMED company           → renders {children}
 *
 * Install-company ripple: on self-host (autoLogin) boot auto-creates a real
 * `companies` row from first boot, so `getCompanyForAuthUser` is ALWAYS truthy
 * there and a bare `if (!company)` check is dead — the guard must instead gate on
 * CLAIMED-ness (a base scenario exists).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAuth,
  mockGetCompany,
  mockIsClaimed,
  mockGetCaps,
  mockGetPrefs,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetCompany: vi.fn(),
  mockIsClaimed: vi.fn(),
  mockGetCaps: vi.fn(),
  mockGetPrefs: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/data", () => ({
  getCompanyForAuthUser: mockGetCompany,
  isCompanyClaimed: mockIsClaimed,
  getDashboardPreferences: mockGetPrefs,
}));
vi.mock("@/lib/capabilities", () => ({ getCapabilities: mockGetCaps }));

// Stub the heavy client subtree so the layout can be invoked as a plain async
// function without rendering the whole shell.
vi.mock("../dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/sentry-user-context", () => ({
  SentryUserContext: () => null,
}));
vi.mock("@/components/ai/chat-session-context", () => ({
  ChatSessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

class RedirectError extends Error {
  constructor(public to: string) {
    super(`REDIRECT:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

import DashboardLayout from "../layout";

const child = <div>dashboard</div>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: cloud edition (no auto-login). Self-host tests override.
  mockGetCaps.mockReturnValue({ autoLogin: false, emailVerification: false });
  mockIsClaimed.mockResolvedValue(true);
  mockGetPrefs.mockResolvedValue(null);
});

describe("dashboard layout onboarding gate", () => {
  it("redirects to /login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(
      DashboardLayout({ children: child }),
    ).rejects.toMatchObject({ to: "/login" });
    expect(mockGetCompany).not.toHaveBeenCalled();
  });

  it("cloud: redirects to /onboarding when the user has no company", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", isEmailVerified: true } });
    mockGetCompany.mockResolvedValue(null);
    await expect(
      DashboardLayout({ children: child }),
    ).rejects.toMatchObject({ to: "/onboarding" });
    // Cloud never auto-creates a placeholder, so the claim check is not needed.
    expect(mockIsClaimed).not.toHaveBeenCalled();
  });

  it("cloud: renders the dashboard when a company exists", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", isEmailVerified: true } });
    mockGetCompany.mockResolvedValue({ id: "company-1" });
    const result = await DashboardLayout({ children: child });
    expect(result).toBeTruthy();
    expect(mockIsClaimed).not.toHaveBeenCalled();
  });

  it("self-host: redirects to /onboarding when the install company is NOT yet claimed", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", isEmailVerified: true } });
    mockGetCompany.mockResolvedValue({ id: "company-1" });
    mockGetCaps.mockReturnValue({ autoLogin: true, emailVerification: false });
    mockIsClaimed.mockResolvedValue(false); // unclaimed install placeholder
    await expect(
      DashboardLayout({ children: child }),
    ).rejects.toMatchObject({ to: "/onboarding" });
    expect(mockIsClaimed).toHaveBeenCalledWith("company-1");
  });

  it("self-host: renders the dashboard once the install company is CLAIMED", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", isEmailVerified: true } });
    mockGetCompany.mockResolvedValue({ id: "company-1" });
    mockGetCaps.mockReturnValue({ autoLogin: true, emailVerification: false });
    mockIsClaimed.mockResolvedValue(true);
    const result = await DashboardLayout({ children: child });
    expect(result).toBeTruthy();
    expect(mockIsClaimed).toHaveBeenCalledWith("company-1");
  });
});
