import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiSidebar, type AiPane } from "../ai-sidebar";

/**
 * AiSidebar nav (S3b Task 13) — after the unified Tools pane landed, the nav
 * collapses the old `Connections` + `Settings` panes into a single `Tools`
 * entry. This guards the NAV contract: insights / history / tools, nothing else.
 */
function renderSidebar(overrides: Partial<React.ComponentProps<typeof AiSidebar>> = {}) {
  const onSelectPane = vi.fn();
  render(
    <AiSidebar
      credits={{ remaining: 100, total: 200 }}
      companionName="Companion"
      activePane={null}
      onSelectPane={onSelectPane}
      onNewChat={vi.fn()}
      mobileOpen={false}
      onMobileClose={vi.fn()}
      {...overrides}
    >
      <div data-testid="pane-content" />
    </AiSidebar>,
  );
  return { onSelectPane };
}

describe("AiSidebar nav (S3b Task 13)", () => {
  it("renders the Tools nav entry and drops Connections/Settings", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "Tools" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Insights" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "History" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  it("selecting Tools calls onSelectPane('tools')", () => {
    const { onSelectPane } = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(onSelectPane).toHaveBeenCalledWith<[AiPane]>("tools");
  });
});
