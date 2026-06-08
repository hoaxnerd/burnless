/**
 * ONB-01 — server guard for /onboarding.
 *
 * - No session  → redirect('/login')
 * - Has company → redirect('/dashboard')  (mirrors the inverse dashboard guard)
 * - No company  → renders {children}
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockGetCompany } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetCompany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/data", () => ({ getCompanyForAuthUser: mockGetCompany }));

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

const child = <div>wizard</div>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ONB-01 onboarding layout guard", () => {
  it("redirects to /login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(
      OnboardingLayout({ children: child }),
    ).rejects.toMatchObject({ to: "/login" });
    expect(mockGetCompany).not.toHaveBeenCalled();
  });

  it("redirects to /dashboard when a company already exists", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetCompany.mockResolvedValue({ id: "company-1" });
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
    expect(result).toBeTruthy();
    const props = (result as { props: { children: React.ReactNode } }).props;
    expect(props.children).toBe(child);
  });
});
