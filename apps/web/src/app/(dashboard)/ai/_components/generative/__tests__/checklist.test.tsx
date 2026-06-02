import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenerativeBlock } from "../generative-block";

describe("GenChecklist via GenerativeBlock", () => {
  it("renders item text and applies a checked style to done items", () => {
    render(
      <GenerativeBlock
        component="checklist"
        props={{
          title: "Fundraising prep",
          items: [
            { text: "Update the pitch deck", checked: true },
            { text: "Build the data room", checked: false },
          ],
        }}
      />
    );
    expect(screen.getByText("Fundraising prep")).toBeInTheDocument();

    const done = screen.getByText("Update the pitch deck");
    const pending = screen.getByText("Build the data room");
    expect(done).toBeInTheDocument();
    expect(pending).toBeInTheDocument();
    // Done items get a strikethrough; pending items do not.
    expect(done.className).toMatch(/line-through/);
    expect(pending.className).not.toMatch(/line-through/);
  });
});
