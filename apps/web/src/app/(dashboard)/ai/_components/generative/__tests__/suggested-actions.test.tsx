import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GenerativeBlock } from "../generative-block";

describe("GenSuggestedActions via GenerativeBlock", () => {
  it("renders each action label as a button", () => {
    render(
      <GenerativeBlock
        component="suggested_actions"
        props={{
          actions: [
            { label: "Show my runway", prompt: "What is my runway?" },
            { label: "Break down burn", prompt: "Break down my burn" },
          ],
        }}
      />
    );
    expect(
      screen.getByRole("button", { name: "Show my runway" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Break down burn" })
    ).toBeInTheDocument();
  });

  it("calls onAction with the action's prompt when clicked", () => {
    const onAction = vi.fn();
    render(
      <GenerativeBlock
        component="suggested_actions"
        props={{
          actions: [{ label: "Show my runway", prompt: "What is my runway?" }],
        }}
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Show my runway" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("What is my runway?");
  });
});
