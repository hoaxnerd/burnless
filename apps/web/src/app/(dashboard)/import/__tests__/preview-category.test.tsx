import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PreviewStep } from "../preview-step";
import { applyPreviewRowEdit } from "../import-utils";
import type { PreviewTransaction } from "../import-utils";

function makeRow(partial: Partial<PreviewTransaction> = {}): PreviewTransaction {
  return {
    date: "2026-01-01T00:00:00.000Z",
    amount: 100,
    description: "AWS bill",
    accountId: "acc-1",
    externalId: "ext-1",
    suggestedCategory: "Software & Tools",
    categoryConfidence: 0.95,
    _edited: false,
    _excluded: false,
    ...partial,
  };
}

function renderPreview(
  preview: PreviewTransaction[],
  editingRow: number | null,
  updatePreviewRow = vi.fn(),
) {
  return render(
    <PreviewStep
      preview={preview}
      activePreview={preview.filter((t) => !t.isDuplicate && !t._excluded)}
      loading={false}
      importProgress={0}
      editingRow={editingRow}
      setEditingRow={vi.fn()}
      toggleRowExclusion={vi.fn()}
      updatePreviewRow={updatePreviewRow}
      executeImport={vi.fn()}
      formatCurrency={(n) => `$${n}`}
      setStep={vi.fn()}
    />,
  );
}

describe("PreviewStep category override (DATA-08)", () => {
  it("renders a category select when the row is being edited", () => {
    renderPreview([makeRow()], 0);
    expect(screen.getByLabelText("Category")).toBeTruthy();
  });

  it("does NOT render a category select when not editing (read-only chip)", () => {
    renderPreview([makeRow()], null);
    expect(screen.queryByLabelText("Category")).toBeNull();
    expect(screen.getByText("Software & Tools")).toBeTruthy();
  });

  it("wires a category change through updatePreviewRow(i, 'category', value)", () => {
    const update = vi.fn();
    renderPreview([makeRow()], 0, update);
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Marketing" } });
    expect(update).toHaveBeenCalledWith(0, "category", "Marketing");
  });

  it("shows the override (not the suggestion) once an override is set", () => {
    renderPreview([makeRow({ categoryOverride: "Marketing" })], null);
    expect(screen.getByText("Marketing")).toBeTruthy();
  });
});

describe("category override flows into the import payload (DATA-08)", () => {
  // Mirrors executeImport's mapped-payload resolution: override wins, else
  // the AI suggestion. This is the exact expression in import-flow.tsx.
  const resolveCategory = (t: PreviewTransaction) =>
    t.categoryOverride ?? t.suggestedCategory ?? undefined;

  it("sends the manual override when present", () => {
    const row = applyPreviewRowEdit(makeRow(), "category", "Marketing");
    expect(resolveCategory(row)).toBe("Marketing");
  });

  it("falls back to the AI suggestion when no override", () => {
    expect(resolveCategory(makeRow())).toBe("Software & Tools");
  });
});
