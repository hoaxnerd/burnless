/**
 * SHELL-02 — ThemeToggle must be reachable in BOTH the collapsed and expanded
 * sidebar branches. Previously it rendered only inside {!collapsed && ...}, so a
 * collapsed rail offered only Sign out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/ui/theme-toggle";
import type { ReactElement } from "react";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

import { SidebarInner, type SidebarInnerProps } from "../sidebar-inner";

function baseProps(collapsed: boolean): SidebarInnerProps {
  return {
    collapsed,
    onToggleCollapse: vi.fn(),
    onClose: vi.fn(),
    isMobile: false,
    orderedNavItems: [],
    navOrder: [],
    pathname: "/dashboard",
    sensors: [] as unknown as SidebarInnerProps["sensors"],
    onDragEnd: vi.fn(),
    masterEnabled: false,
    chatEnabled: false,
    quickActionMode: "dynamic",
    onSetQuickActionMode: vi.fn(),
    quickActions: [],
    quickActionModeOverrides: {},
    onSetQuickActionItemMode: vi.fn(),
    onOpenSearch: vi.fn(),
    onToggleAI: vi.fn(),
    user: { name: "Morgan", email: "m@x.com", image: null },
    dndContextId: "dnd-test",
  };
}

function renderSidebar(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("SidebarInner — SHELL-02 theme toggle in both branches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the ThemeToggle in the EXPANDED sidebar", () => {
    renderSidebar(<SidebarInner {...baseProps(false)} />);
    expect(
      screen.getByRole("button", { name: /switch to (light|dark) mode/i }),
    ).toBeTruthy();
  });

  it("renders the ThemeToggle in the COLLAPSED sidebar", () => {
    renderSidebar(<SidebarInner {...baseProps(true)} />);
    expect(
      screen.getByRole("button", { name: /switch to (light|dark) mode/i }),
    ).toBeTruthy();
  });
});
