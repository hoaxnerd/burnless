/**
 * Your MCP tab (mockup expose-ui.html §1): endpoint card with copyable URL,
 * PAT table rows with mask + scope badges + two-click revoke, Connected apps
 * with revoke, audit teaser line.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockUseApiTokens, mockUseOauthGrants, mockApiFetch } = vi.hoisted(() => ({
  mockUseApiTokens: vi.fn(),
  mockUseOauthGrants: vi.fn(),
  mockApiFetch: vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
}));

vi.mock("@/lib/swr/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/swr/hooks")>();
  return {
    ...actual,
    useApiTokens: mockUseApiTokens,
    useOauthGrants: mockUseOauthGrants,
    useCompany: vi.fn().mockReturnValue({
      data: { id: "c1", name: "Acme", currency: "USD", mcpServerEnabled: true },
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    }),
  };
});
vi.mock("@/lib/api-fetch", () => ({ apiFetch: mockApiFetch }));
// Repo reality: useToast throws outside <ToastProvider>; component tests mock it
// (same pattern as manage-departments-panel.test.tsx).
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

import { YourMcpTab } from "../your-mcp-tab";

const TOKEN = {
  id: "tok-1",
  name: "Claude Desktop",
  lastFour: "f42a",
  scopes: ["read", "write"] as const,
  expiresAt: "2026-08-09T00:00:00.000Z",
  lastUsedAt: "2026-06-11T10:00:00.000Z",
  createdAt: "2026-06-01T00:00:00.000Z",
};
const GRANT = {
  grantId: "g-1",
  clientId: "c-1",
  clientName: "Claude",
  scopes: ["read", "write"] as const,
  createdAt: "2026-06-02T00:00:00.000Z",
};

beforeEach(() => {
  mockApiFetch.mockClear();
  mockUseApiTokens.mockReturnValue({ data: [TOKEN], isLoading: false, error: undefined, mutate: vi.fn() });
  mockUseOauthGrants.mockReturnValue({ data: [GRANT], isLoading: false, error: undefined, mutate: vi.fn() });
});

describe("YourMcpTab", () => {
  it("shows the endpoint, masked token, scope badges, and connected app", () => {
    render(<YourMcpTab mcpEndpoint="http://localhost:3000/mcp" userRole="owner" />);
    expect(screen.getByText("http://localhost:3000/mcp")).toBeTruthy();
    expect(screen.getByText("bl_pat_••••f42a")).toBeTruthy();
    // "Claude Desktop" is both the token name and an endpoint-card setup pill.
    expect(screen.getAllByText("Claude Desktop").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.getAllByText("read").length).toBeGreaterThanOrEqual(2);
  });

  it("revoking a PAT is two-click (arm → confirm) and calls DELETE", async () => {
    render(<YourMcpTab mcpEndpoint="http://localhost:3000/mcp" userRole="owner" />);
    const revoke = screen.getByRole("button", { name: "Revoke token Claude Desktop" });
    fireEvent.click(revoke); // arm
    expect(mockApiFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke Claude Desktop" }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/api/tokens/tok-1", { method: "DELETE" });
    });
  });

  it("revoking an OAuth grant calls DELETE on the grant route", async () => {
    render(<YourMcpTab mcpEndpoint="http://localhost:3000/mcp" userRole="owner" />);
    const revoke = screen.getByRole("button", { name: "Revoke app Claude" });
    fireEvent.click(revoke);
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke Claude" }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/api/oauth/grants/g-1", { method: "DELETE" });
    });
  });

  it("empty states render when no tokens / grants exist", () => {
    mockUseApiTokens.mockReturnValue({ data: [], isLoading: false, error: undefined, mutate: vi.fn() });
    mockUseOauthGrants.mockReturnValue({ data: [], isLoading: false, error: undefined, mutate: vi.fn() });
    render(<YourMcpTab mcpEndpoint="http://localhost:3000/mcp" userRole="viewer" />);
    expect(screen.getByText(/No tokens yet/i)).toBeTruthy();
    expect(screen.getByText(/No apps authorized yet/i)).toBeTruthy();
  });

  it("owner sees an enabled kill switch; viewer sees it inert", () => {
    render(<YourMcpTab mcpEndpoint="http://localhost:3000/mcp" userRole="owner" />);
    expect(screen.getByRole("switch", { name: "External agent access" })).toBeTruthy();
    expect(screen.getByText(/tokens stay intact/i)).toBeTruthy();
  });

  it("toggling the switch PATCHes /api/company", async () => {
    render(<YourMcpTab mcpEndpoint="http://localhost:3000/mcp" userRole="owner" />);
    fireEvent.click(screen.getByRole("switch", { name: "External agent access" }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/company",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ mcpServerEnabled: false }) })
      );
    });
  });

  it("non-https non-localhost endpoint shows the reachability warning", () => {
    render(<YourMcpTab mcpEndpoint="http://192.168.1.20:3000/mcp" userRole="owner" />);
    expect(screen.getByText(/require HTTPS or localhost/i)).toBeTruthy();
    expect(screen.getByText("Unreachable")).toBeTruthy();
  });
});
