import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AutomationCard } from "../automation-card";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const job = {
  id: "j1",
  name: "Weekly Stripe revenue sync",
  prompt: "Pull last week's Stripe revenue and update the Subscriptions revenue stream",
  actionKind: "write" as const,
  allowedTools: ["mcp__stripe__list_charges", "update_revenue_stream", "list_accounts"],
  boundConnectionIds: ["conn1"],
  schedule: "0 9 * * 1",
  timezone: "UTC",
  enabled: true,
  status: "active" as const,
  notifyPolicy: "smart" as const,
  consecutiveFailures: 0,
  lastRunAt: null,
  nextRunAt: "2999-01-01T09:00:00Z",
  createdAt: "2026-06-01T00:00:00Z",
};

describe("AutomationCard", () => {
  it("renders name, write tag, truncated prompt, schedule, tool count", () => {
    render(
      <AutomationCard
        job={job}
        onToggle={() => {}}
        onRunNow={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("Weekly Stripe revenue sync")).toBeTruthy();
    expect(screen.getByText(/writes data/i)).toBeTruthy();
    expect(screen.getByText(/3 tools/i)).toBeTruthy();
  });
  it("toggling the switch calls onToggle with the next enabled state", () => {
    const onToggle = vi.fn();
    render(
      <AutomationCard
        job={job}
        onToggle={onToggle}
        onRunNow={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });
  it("disabled job dims the card", () => {
    render(
      <AutomationCard
        job={{ ...job, enabled: false, status: "auto_disabled" }}
        onToggle={() => {}}
        onRunNow={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByTestId("automation-card").className).toContain("opacity-[0.72]");
  });
});
