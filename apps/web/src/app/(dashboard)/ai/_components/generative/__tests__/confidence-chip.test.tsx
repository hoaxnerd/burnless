// apps/web/src/app/(dashboard)/ai/_components/generative/__tests__/confidence-chip.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceChip } from "../confidence-chip";

describe("ConfidenceChip", () => {
  it("renders a High chip + rationale", () => {
    render(<ConfidenceChip confidence="high" rationale="because you said add MRR" />);
    expect(screen.getByText(/high confidence/i)).toBeTruthy();
    expect(screen.getByText(/because you said add MRR/i)).toBeTruthy();
  });

  it("renders a Low chip", () => {
    render(<ConfidenceChip confidence="low" />);
    expect(screen.getByText(/low confidence/i)).toBeTruthy();
  });

  it("renders nothing when neither field is present", () => {
    const { container } = render(<ConfidenceChip />);
    expect(container.firstChild).toBeNull();
  });

  it("renders just the rationale when confidence is absent", () => {
    render(<ConfidenceChip rationale="estimate from current burn" />);
    expect(screen.getByText(/estimate from current burn/i)).toBeTruthy();
    expect(screen.queryByText(/confidence/i)).toBeNull();
  });
});
