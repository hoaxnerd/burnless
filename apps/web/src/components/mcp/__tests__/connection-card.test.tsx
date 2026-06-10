import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionCard } from "../connection-card";

const CONN = {
  id: "c1",
  name: "Stripe",
  slug: "stripe",
  ownerScope: "company" as const,
  transport: "streamable_http" as const,
  endpoint: "https://mcp.stripe.com",
  authType: "oauth" as const,
  status: "connected" as const,
  capabilities: { tools: Array.from({ length: 14 }, (_, i) => ({ name: `t${i}` })) },
  lastError: null,
};

describe("ConnectionCard", () => {
  it("renders name, host, scope, status, tool count, manage link", () => {
    render(<ConnectionCard connection={CONN} onManage={() => {}} />);
    expect(screen.getByText("Stripe")).toBeTruthy();
    expect(screen.getByText("mcp.stripe.com")).toBeTruthy(); // host only, per mockup
    expect(screen.getByText("Company")).toBeTruthy();
    expect(screen.getByText(/Connected · OAuth/)).toBeTruthy();
    expect(screen.getByText("14")).toBeTruthy();
    expect(screen.getByText(/Manage/)).toBeTruthy();
  });

  it("needs_auth shows the warning pill + Authenticate action", () => {
    render(
      <ConnectionCard
        connection={{ ...CONN, status: "needs_auth", ownerScope: "personal", capabilities: null }}
        onManage={() => {}}
      />,
    );
    expect(screen.getByText(/Needs sign-in/)).toBeTruthy();
    expect(screen.getByText("Personal")).toBeTruthy();
    expect(screen.getByText(/Authenticate/)).toBeTruthy();
  });

  it("stdio connections show the command as the subtitle", () => {
    render(
      <ConnectionCard
        connection={{ ...CONN, transport: "stdio", endpoint: "npx", name: "Postgres (local)", authType: "pat" }}
        onManage={() => {}}
      />,
    );
    expect(screen.getByText(/stdio · npx/)).toBeTruthy();
  });
});
