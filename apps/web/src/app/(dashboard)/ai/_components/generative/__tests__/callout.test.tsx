import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenerativeBlock } from "../generative-block";

describe("GenCallout via GenerativeBlock", () => {
  it("renders a warning callout", () => {
    render(
      <GenerativeBlock
        component="callout"
        props={{ severity: "warning", title: "Heads up", body: "Short runway." }}
      />
    );
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Short runway.")).toBeInTheDocument();
  });
});
