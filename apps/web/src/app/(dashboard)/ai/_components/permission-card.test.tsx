import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionCard } from "./permission-card";
import type { PendingPermission } from "./types";

const pending: PendingPermission = {
  pauseId: "p1",
  conversationId: "c1",
  actions: [
    { requestId: "t1", tool: "create_forecast_line", category: "write", description: 'create forecast line "AWS"', input: { accountId: "a1" } },
  ],
};

describe("PermissionCard", () => {
  it("shows the action description and three choices", () => {
    render(<PermissionCard pending={pending} onDecide={() => {}} />);
    expect(screen.getByText(/create forecast line "AWS"/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /allow once/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /allow for session/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /deny/i })).toBeTruthy();
  });

  it("emits an 'once' decision for the action on Allow once", () => {
    const onDecide = vi.fn();
    render(<PermissionCard pending={pending} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: /allow once/i }));
    expect(onDecide).toHaveBeenCalledWith([{ requestId: "t1", decision: "once" }]);
  });

  it("Deny emits deny for the action", () => {
    const onDecide = vi.fn();
    render(<PermissionCard pending={pending} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: /deny/i }));
    expect(onDecide).toHaveBeenCalledWith([{ requestId: "t1", decision: "deny" }]);
  });

  it("renders nothing actionable once resolved", () => {
    render(<PermissionCard pending={{ ...pending, resolved: true }} onDecide={() => {}} />);
    expect(screen.queryByRole("button", { name: /allow once/i })).toBeNull();
  });
});
