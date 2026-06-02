import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenerativeBlock } from "../generative-block";

describe("GenerativeBlock", () => {
  it("renders an unsupported-component fallback without throwing", () => {
    render(<GenerativeBlock component="totally_unknown" props={{}} />);
    expect(screen.getByText(/unsupported component/i)).toBeInTheDocument();
  });
});
