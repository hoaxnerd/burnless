import { describe, it, expect, vi } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog, useConfirm, type ConfirmOptions } from "../confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders title, body and labels when open", () => {
    render(
      <ConfirmDialog
        open
        title="Delete scenario?"
        body="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Delete scenario?")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmDialog open={false} title="x" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("fires onConfirm / onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="x" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

/** Host that drives useConfirm and records the resolved value. */
function Host({ opts, onResolved }: { opts: ConfirmOptions; onResolved: (v: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  const started = useRef(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (started.current) return;
          started.current = true;
          void confirm(opts).then(onResolved);
        }}
      >
        ask
      </button>
      {dialog}
    </div>
  );
}

describe("useConfirm", () => {
  it("opens the dialog and resolves true when confirmed", async () => {
    const onResolved = vi.fn();
    render(<Host opts={{ title: "Proceed?" }} onResolved={onResolved} />);

    // No dialog until confirm() is called.
    expect(screen.queryByText("Proceed?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    expect(screen.getByText("Proceed?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(onResolved).toHaveBeenCalledWith(true));
  });

  it("resolves false when cancelled", async () => {
    const onResolved = vi.fn();
    render(<Host opts={{ title: "Proceed?" }} onResolved={onResolved} />);

    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await vi.waitFor(() => expect(onResolved).toHaveBeenCalledWith(false));
  });
});
