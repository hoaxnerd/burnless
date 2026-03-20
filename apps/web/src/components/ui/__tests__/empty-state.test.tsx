import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PageEmptyState,
  SetupPrompt,
  ScenarioPrompt,
  ExpensesEmptyState,
} from "../empty-state";
import { Receipt } from "lucide-react";

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { vi } from "vitest";

describe("PageEmptyState", () => {
  it("renders title, description, and CTA", () => {
    render(
      <PageEmptyState
        icon={Receipt}
        title="No Data"
        description="Add your first item"
        ctaLabel="Get Started"
        ctaHref="/start"
      />
    );
    expect(screen.getByText("No Data")).toBeInTheDocument();
    expect(screen.getByText("Add your first item")).toBeInTheDocument();
    const cta = screen.getByText("Get Started");
    expect(cta).toBeInTheDocument();
    expect(cta.closest("a")).toHaveAttribute("href", "/start");
  });

  it("renders AI hint when provided", () => {
    render(
      <PageEmptyState
        icon={Receipt}
        title="Empty"
        description="Nothing here"
        ctaLabel="Add"
        ctaHref="/add"
        aiHint="Try asking AI for help"
      />
    );
    expect(screen.getByText("Try asking AI for help")).toBeInTheDocument();
  });

  it("does not render AI hint when not provided", () => {
    const { container } = render(
      <PageEmptyState
        icon={Receipt}
        title="Empty"
        description="Nothing here"
        ctaLabel="Add"
        ctaHref="/add"
      />
    );
    // No sparkles AI hint section
    expect(container.querySelector(".bg-brand-50\\/50")).not.toBeInTheDocument();
  });
});

describe("SetupPrompt", () => {
  it("renders welcome message", () => {
    render(<SetupPrompt />);
    expect(screen.getByText("Welcome to Burnless")).toBeInTheDocument();
    expect(screen.getByText("Get started")).toBeInTheDocument();
  });

  it("includes context in description when provided", () => {
    render(<SetupPrompt context="tracking expenses" />);
    expect(
      screen.getByText(/start tracking expenses/)
    ).toBeInTheDocument();
  });
});

describe("ScenarioPrompt", () => {
  it("renders scenario creation prompt", () => {
    render(<ScenarioPrompt />);
    expect(screen.getByText("Create Your First Scenario")).toBeInTheDocument();
    expect(screen.getByText("Create scenario")).toBeInTheDocument();
  });
});

describe("ExpensesEmptyState", () => {
  it("renders expense-specific empty state", () => {
    render(<ExpensesEmptyState />);
    expect(screen.getByText("Track Your Spending")).toBeInTheDocument();
    expect(screen.getByText("Add expenses")).toBeInTheDocument();
  });
});
