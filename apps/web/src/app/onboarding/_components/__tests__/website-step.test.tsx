import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { WebsiteStep, isLikelyWebsite } from "../website-step";

function renderStep(websiteUrl: string, onWebsiteUrlChange = vi.fn()) {
  const ref = createRef<HTMLInputElement>();
  render(
    <WebsiteStep
      websiteUrl={websiteUrl}
      onWebsiteUrlChange={onWebsiteUrlChange}
      onSubmit={vi.fn((e) => e.preventDefault())}
      onSkipToForm={vi.fn()}
      onSkipOnboarding={vi.fn()}
      inputRef={ref}
    />,
  );
}

describe("ONB-03 isLikelyWebsite", () => {
  it("accepts a bare domain", () => {
    expect(isLikelyWebsite("stripe.com")).toBe(true);
  });
  it("accepts a domain with a scheme", () => {
    expect(isLikelyWebsite("https://stripe.com")).toBe(true);
    expect(isLikelyWebsite("http://www.stripe.com/about")).toBe(true);
  });
  it("rejects bare garbage with no dot", () => {
    expect(isLikelyWebsite("asdf")).toBe(false);
  });
  it("rejects a trailing dot with no TLD", () => {
    expect(isLikelyWebsite("stripe.")).toBe(false);
  });
  it("rejects empty input", () => {
    expect(isLikelyWebsite("")).toBe(false);
    expect(isLikelyWebsite("   ")).toBe(false);
  });
});

describe("ONB-03 WebsiteStep", () => {
  it("exposes an accessible label 'Company website URL'", () => {
    renderStep("");
    expect(screen.getByLabelText("Company website URL")).toBeInTheDocument();
  });

  it("renders the input as type=url", () => {
    renderStep("");
    expect(screen.getByLabelText("Company website URL")).toHaveAttribute(
      "type",
      "url",
    );
  });

  it("wires aria-describedby to the helper text", () => {
    renderStep("");
    const input = screen.getByLabelText("Company website URL");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toBeInTheDocument();
  });

  it("disables submit for invalid input like 'asdf'", () => {
    renderStep("asdf");
    expect(
      screen.getByRole("button", { name: /set up my company/i }),
    ).toBeDisabled();
  });

  it("disables submit for empty input", () => {
    renderStep("");
    expect(
      screen.getByRole("button", { name: /set up my company/i }),
    ).toBeDisabled();
  });

  it("enables submit for a valid bare domain", () => {
    renderStep("stripe.com");
    expect(
      screen.getByRole("button", { name: /set up my company/i }),
    ).toBeEnabled();
  });
});
