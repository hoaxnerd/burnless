import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AsyncData, useQueryState } from "../async-data";
import { renderHook } from "@testing-library/react";

describe("AsyncData", () => {
  it("renders the loading branch while isLoading", () => {
    render(
      <AsyncData query={{ data: undefined, error: undefined, isLoading: true }}>
        {() => <div>DATA</div>}
      </AsyncData>,
    );
    expect(screen.queryByText("DATA")).not.toBeInTheDocument();
  });

  it("renders a custom loading node", () => {
    render(
      <AsyncData
        query={{ data: undefined, error: undefined, isLoading: true }}
        loading={<div>LOADING…</div>}
      >
        {() => <div>DATA</div>}
      </AsyncData>,
    );
    expect(screen.getByText("LOADING…")).toBeInTheDocument();
  });

  it("renders the error branch with a normalized message (not raw JSON)", () => {
    const err = Object.assign(new Error("Request failed"), {
      status: 400,
      info: { error: "Bad input here" },
    });
    render(
      <AsyncData query={{ data: undefined, error: err, isLoading: false }}>
        {() => <div>DATA</div>}
      </AsyncData>,
    );
    expect(screen.getByText("Bad input here")).toBeInTheDocument();
    expect(screen.queryByText(/\{/)).not.toBeInTheDocument();
  });

  it("renders the empty branch for an empty array", () => {
    render(
      <AsyncData
        query={{ data: [], error: undefined, isLoading: false }}
        emptyTitle="No rows"
      >
        {() => <div>DATA</div>}
      </AsyncData>,
    );
    expect(screen.getByText("No rows")).toBeInTheDocument();
    expect(screen.queryByText("DATA")).not.toBeInTheDocument();
  });

  it("renders the data branch with non-empty data", () => {
    render(
      <AsyncData query={{ data: [1, 2, 3], error: undefined, isLoading: false }}>
        {(rows) => <div>rows: {rows.length}</div>}
      </AsyncData>,
    );
    expect(screen.getByText("rows: 3")).toBeInTheDocument();
  });

  it("wires onRetry into the error state", () => {
    const onRetry = vi.fn();
    render(
      <AsyncData
        query={{ data: undefined, error: new Error("nope"), isLoading: false }}
        onRetry={onRetry}
      >
        {() => <div>DATA</div>}
      </AsyncData>,
    );
    screen.getByRole("button").click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("useQueryState", () => {
  it("treats undefined data with no error as loading", () => {
    const { result } = renderHook(() =>
      useQueryState({ data: undefined as number | undefined }),
    );
    expect(result.current.isLoading).toBe(true);
  });

  it("passes through an explicit isLoading flag", () => {
    const { result } = renderHook(() =>
      useQueryState({ data: 5, isLoading: false }),
    );
    expect(result.current).toEqual({ data: 5, error: undefined, isLoading: false });
  });
});
