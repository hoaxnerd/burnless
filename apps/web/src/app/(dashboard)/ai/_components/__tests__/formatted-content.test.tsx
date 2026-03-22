import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormattedContent } from "../formatted-content";

describe("FormattedContent", () => {
  it("returns null for empty content", () => {
    const { container } = render(<FormattedContent content="" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders plain text as paragraph", () => {
    render(<FormattedContent content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders bold markdown", () => {
    render(<FormattedContent content="This is **important** text" />);
    const strong = screen.getByText("important");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders inline code", () => {
    render(<FormattedContent content="Use `git status` to check" />);
    const code = screen.getByText("git status");
    expect(code.tagName).toBe("CODE");
  });

  it("renders italic text", () => {
    render(<FormattedContent content="This is *italic* text" />);
    const em = screen.getByText("italic");
    expect(em.tagName).toBe("EM");
  });

  it("renders h2 headings", () => {
    render(<FormattedContent content="## Summary" />);
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Summary").closest("h2")).toBeInTheDocument();
  });

  it("renders h3 headings", () => {
    render(<FormattedContent content="### Details" />);
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Details").closest("h3")).toBeInTheDocument();
  });

  it("renders list items with dash prefix", () => {
    render(<FormattedContent content={"- Item one\n- Item two"} />);
    expect(screen.getByText("Item one")).toBeInTheDocument();
    expect(screen.getByText("Item two")).toBeInTheDocument();
  });

  it("renders list items with asterisk prefix", () => {
    render(<FormattedContent content="* Item A" />);
    expect(screen.getByText("Item A")).toBeInTheDocument();
  });

  it("renders blank lines as spacers", () => {
    const { container } = render(<FormattedContent content={"Line 1\n\nLine 2"} />);
    // Blank line renders a div spacer
    const divs = container.querySelectorAll("div > div");
    expect(divs.length).toBeGreaterThan(0);
    expect(screen.getByText("Line 1")).toBeInTheDocument();
    expect(screen.getByText("Line 2")).toBeInTheDocument();
  });

  it("handles multi-line content", () => {
    render(
      <FormattedContent
        content={`## Financial Summary\n\n- MRR: **$12,000**\n- Runway: 18 months`}
      />
    );
    expect(screen.getByText("Financial Summary")).toBeInTheDocument();
    expect(screen.getByText("$12,000")).toBeInTheDocument();
  });
});
