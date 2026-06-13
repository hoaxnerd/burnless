import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProviderLogo } from "../provider-logo";

describe("ProviderLogo", () => {
  it("renders the kind's initials label", () => {
    const { getByText } = render(<ProviderLogo kind="openrouter" />);
    expect(getByText("OR")).toBeInTheDocument();
  });
  it("falls back to the custom glyph for an unknown kind", () => {
    const { getByText } = render(<ProviderLogo kind="totally-unknown" />);
    expect(getByText("+")).toBeInTheDocument();
  });
});
