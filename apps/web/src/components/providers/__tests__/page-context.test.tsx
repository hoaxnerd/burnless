import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageProvider, usePageId } from "../page-context";

function TestConsumer() {
  const pageId = usePageId();
  return <div data-testid="page-id">{pageId ?? ""}</div>;
}

describe("PageContext", () => {
  it("provides pageId to children", () => {
    render(
      <PageProvider pageId="expenses">
        <TestConsumer />
      </PageProvider>
    );
    expect(screen.getByTestId("page-id").textContent).toBe("expenses");
  });

  it("usePageId returns null outside provider", () => {
    render(<TestConsumer />);
    expect(screen.getByTestId("page-id").textContent).toBe("");
  });
});
