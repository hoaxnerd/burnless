import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenerativeBlock } from "../generative-block";

describe("GenProgressSteps via GenerativeBlock", () => {
  it("renders all step labels and applies an active style to the active step", () => {
    render(
      <GenerativeBlock
        component="progress_steps"
        props={{
          steps: [
            { label: "Prep the data room", status: "done" },
            { label: "Run partner meetings", status: "active" },
            { label: "Sign the term sheet", status: "pending" },
          ],
        }}
      />
    );

    const done = screen.getByText("Prep the data room");
    const active = screen.getByText("Run partner meetings");
    const pending = screen.getByText("Sign the term sheet");
    expect(done).toBeInTheDocument();
    expect(active).toBeInTheDocument();
    expect(pending).toBeInTheDocument();

    // The active step label is emphasized; non-active steps are not.
    expect(active.className).toMatch(/font-semibold/);
    expect(pending.className).not.toMatch(/font-semibold/);
  });
});
