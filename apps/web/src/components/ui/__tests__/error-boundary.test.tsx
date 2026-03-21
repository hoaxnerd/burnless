import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../error-boundary";

// Mock error-reporting module
vi.mock("@/lib/error-reporting", () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test explosion");
  }
  return <div>All good</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // Suppress React error boundary console errors during tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("renders default fallback when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test explosion")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom error UI")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("renders retry button in default fallback", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("reports error to error-reporting module", async () => {
    const { captureException } = await import("@/lib/error-reporting");
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it("shows generic message when error has no message", () => {
    function ThrowNull(): React.JSX.Element {
      throw new Error("");
    }
    render(
      <ErrorBoundary>
        <ThrowNull />
      </ErrorBoundary>
    );
    expect(
      screen.getByText("An unexpected error occurred while rendering this section.")
    ).toBeInTheDocument();
  });
});
