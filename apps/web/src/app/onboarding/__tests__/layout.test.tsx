/**
 * ONB-01 — server guard for /onboarding.
 *
 * - No session                         → redirect('/login')
 * - Has CLAIMED company                 → redirect('/dashboard')
 * - No company                          → renders {children}
 * - Self-host UNCLAIMED install company → renders {children}  (so the user can
 *   claim the boot-created placeholder via the wizard — see install-company
 *   ripple: boot now creates a real companies row from first boot, so a bare
 *   company-existence check would lock self-host users out of /onboarding).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockGetCompany, mockIsClaimed, mockGetCaps } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    mockGetCompany: vi.fn(),
    mockIsClaimed: vi.fn(),
    mockGetCaps: vi.fn(),
  }),
);

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/data", () => ({
  getCompanyForAuthUser: mockGetCompany,
  isCompanyClaimed: mockIsClaimed,
}));
vi.mock("@/lib/capabilities", () => ({ getCapabilities: mockGetCaps }));

// redirect() throws internally in Next; reproduce that so we can assert the
// target without rendering downstream.
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

import OnboardingLayout from "../layout";
import { SWRProvider } from "@/lib/swr/provider";

const child = <div>wizard</div>;

function expectRendersChild(result: unknown) {
  expect(result).toBeTruthy();
  const props = (result as { props: { children: React.ReactNode } }).props;
  expect(props.children).toBe(child);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: cloud edition (no auto-login). Self-host tests override.
  mockGetCaps.mockReturnValue({ autoLogin: false });
  mockIsClaimed.mockResolvedValue(true);
});

describe("ONB-01 onboarding layout guard", () => {
  it("redirects to /login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(
      OnboardingLayout({ children: child }),
    ).rejects.toMatchObject({ to: "/login" });
    expect(mockGetCompany).not.toHaveBeenCalled();
  });

  it("redirects to /dashboard when a CLAIMED company already exists", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetCompany.mockResolvedValue({ id: "company-1" });
    mockIsClaimed.mockResolvedValue(true);
    await expect(
      OnboardingLayout({ children: child }),
    ).rejects.toMatchObject({ to: "/dashboard" });
    expect(mockGetCompany).toHaveBeenCalledWith("user-1");
  });

  it("renders children when the user has no company", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetCompany.mockResolvedValue(null);
    const result = await OnboardingLayout({ children: child });
    // The guard returns its children unchanged when no company exists.
    expectRendersChild(result);
  });

  it("renders children for a self-host UNCLAIMED install company (lets the user claim it)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetCompany.mockResolvedValue({ id: "company-1" });
    mockGetCaps.mockReturnValue({ autoLogin: true }); // self-host
    mockIsClaimed.mockResolvedValue(false); // install placeholder, not yet claimed
    const result = await OnboardingLayout({ children: child });
    expectRendersChild(result);
    expect(mockIsClaimed).toHaveBeenCalledWith("company-1");
  });

  it("wraps onboarding children in SWRProvider (so the AI-provider list fetches in onboarding)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetCompany.mockResolvedValue(null);
    const result = await OnboardingLayout({ children: child });
    expect((result as { type: unknown }).type).toBe(SWRProvider);
  });

  it("redirects to /dashboard for a self-host company that is already CLAIMED", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetCompany.mockResolvedValue({ id: "company-1" });
    mockGetCaps.mockReturnValue({ autoLogin: true }); // self-host
    mockIsClaimed.mockResolvedValue(true);
    await expect(
      OnboardingLayout({ children: child }),
    ).rejects.toMatchObject({ to: "/dashboard" });
  });

  it("redirects to /dashboard on cloud regardless of claim sentinel (no install company there)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetCompany.mockResolvedValue({ id: "company-1" });
    mockGetCaps.mockReturnValue({ autoLogin: false }); // cloud
    await expect(
      OnboardingLayout({ children: child }),
    ).rejects.toMatchObject({ to: "/dashboard" });
    // Cloud never auto-creates a placeholder, so the claim check is not needed.
    expect(mockIsClaimed).not.toHaveBeenCalled();
  });
});
