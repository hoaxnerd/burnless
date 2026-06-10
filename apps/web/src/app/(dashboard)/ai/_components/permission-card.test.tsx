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

import type { ScenarioOverrideDelta } from "./types";

const overrideDelta: ScenarioOverrideDelta[] = [
  { action: "create", entityType: "revenue_stream", entityId: "id1", before: null, after: { id: "id1", name: "Pro Plan", type: "subscription" } },
];
const pendingWithDiff: PendingPermission = {
  pauseId: "p2",
  conversationId: "c1",
  actions: [
    { requestId: "t1", tool: "create_revenue_stream", category: "write", description: 'create revenue stream "Pro Plan"', input: { name: "Pro Plan" }, override: overrideDelta },
  ],
};

describe("PermissionCard diff-gate", () => {
  it("renders the before/after diff and Apply/Cancel labels when an override is present", () => {
    render(<PermissionCard pending={pendingWithDiff} onDecide={() => {}} />);
    expect(screen.getByText("Pro Plan")).toBeTruthy();          // the diff
    expect(screen.getByRole("button", { name: /apply/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  });

  it("Apply emits an 'once' decision (same approve path)", () => {
    const onDecide = vi.fn();
    render(<PermissionCard pending={pendingWithDiff} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onDecide).toHaveBeenCalledWith([{ requestId: "t1", decision: "once" }]);
  });

  it("Cancel emits a 'deny' decision", () => {
    const onDecide = vi.fn();
    render(<PermissionCard pending={pendingWithDiff} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onDecide).toHaveBeenCalledWith([{ requestId: "t1", decision: "deny" }]);
  });

  it("without an override, keeps the existing Allow once / Deny labels", () => {
    render(<PermissionCard pending={pending} onDecide={() => {}} />);
    expect(screen.getByRole("button", { name: /allow once/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^deny$/i })).toBeTruthy();
  });
});

describe("PermissionCard — MCP tool name (tools-in-chat.html .perm)", () => {
  const pendingMcp: PendingPermission = {
    pauseId: "p3",
    conversationId: "c1",
    actions: [
      {
        requestId: "t1",
        tool: "mcp__stripe__send_invoice_reminder",
        category: "write",
        description: "send 3 invoice reminders",
        input: { invoiceIds: ["INV-1042"] },
      },
    ],
  };

  it("shows the namespaced tool as 'slug · tool' in the details, not the humanized raw name", () => {
    render(<PermissionCard pending={pendingMcp} onDecide={() => {}} />);
    fireEvent.click(screen.getByText(/show details/i));
    expect(screen.getByText("stripe · send_invoice_reminder")).toBeTruthy();
    expect(screen.queryByText(/Mcp stripe send invoice reminder/i)).toBeNull();
  });

  it("keeps the humanized label for native tools", () => {
    render(<PermissionCard pending={pending} onDecide={() => {}} />);
    fireEvent.click(screen.getByText(/show details/i));
    expect(screen.getByText("Create forecast line")).toBeTruthy();
  });
});
