import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenerativeBlock, GenerativeBlocks } from "../generative-block";

describe("GenerativeBlock", () => {
  it("renders an unsupported-component fallback without throwing", () => {
    render(<GenerativeBlock component="totally_unknown" props={{}} />);
    expect(screen.getByText(/unsupported component/i)).toBeInTheDocument();
  });

  it("accepts an optional onAction prop without error", () => {
    const onAction = vi.fn();
    render(
      <GenerativeBlock component="totally_unknown" props={{}} onAction={onAction} />
    );
    expect(screen.getByText(/unsupported component/i)).toBeInTheDocument();
  });
});

describe("GenerativeBlocks", () => {
  it("accepts an optional onAction prop without error", () => {
    const onAction = vi.fn();
    render(<GenerativeBlocks blocks={[]} onAction={onAction} />);
    // No blocks → renders nothing, but the onAction prop must be accepted.
    expect(onAction).not.toHaveBeenCalled();
  });
});
