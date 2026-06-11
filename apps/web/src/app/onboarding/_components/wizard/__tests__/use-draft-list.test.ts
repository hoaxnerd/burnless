import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDraftList } from "../use-draft-list";

interface Row {
  name: string;
}

describe("useDraftList", () => {
  it("seeds items from suggestions as unsaved drafts", () => {
    const { result } = renderHook(() =>
      useDraftList<Row>({
        suggestions: [{ name: "A" }, { name: "B" }],
        create: vi.fn(),
        update: vi.fn(),
      }),
    );
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.every((it) => !it.saved)).toBe(true);
    // Keys are stable + unique (no Math.random/Date.now).
    expect(new Set(result.current.items.map((it) => it.key)).size).toBe(2);
  });

  it("flush() POSTs each unsaved item, marks them saved, returns true", async () => {
    const create = vi
      .fn<(v: Row) => Promise<string>>()
      .mockResolvedValueOnce("id-1")
      .mockResolvedValueOnce("id-2");
    const { result } = renderHook(() =>
      useDraftList<Row>({
        suggestions: [{ name: "A" }, { name: "B" }],
        create,
        update: vi.fn(),
      }),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.flush();
    });

    expect(ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.current.items.every((it) => it.saved)).toBe(true);
    expect(result.current.items.map((it) => it.id)).toEqual(["id-1", "id-2"]);
  });

  it("flush() returns false and sets error when a create fails", async () => {
    const create = vi
      .fn<(v: Row) => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() =>
      useDraftList<Row>({
        suggestions: [{ name: "A" }],
        create,
        update: vi.fn(),
      }),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.flush();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("boom");
    expect(result.current.items[0]!.saved).toBe(false);
  });

  it("save() in add mode POSTs and appends a saved item", async () => {
    const create = vi.fn<(v: Row) => Promise<string>>().mockResolvedValue("new-id");
    const { result } = renderHook(() =>
      useDraftList<Row>({ suggestions: [], create, update: vi.fn() }),
    );

    act(() => result.current.openAdd());
    await act(async () => {
      await result.current.save({ name: "Fresh" });
    });

    expect(create).toHaveBeenCalledWith({ name: "Fresh" });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ saved: true, id: "new-id" });
    expect(result.current.mode).toEqual({ kind: "list" });
  });

  it("save() editing a SAVED item PATCHes via update and replaces values", async () => {
    const create = vi.fn<(v: Row) => Promise<string>>().mockResolvedValue("id-1");
    const update = vi.fn<(id: string, v: Row) => Promise<void>>().mockResolvedValue();
    const { result } = renderHook(() =>
      useDraftList<Row>({ suggestions: [{ name: "A" }], create, update }),
    );

    // Save the draft first (POST) so it becomes saved with an id.
    const key = result.current.items[0]!.key;
    act(() => result.current.openEdit(key));
    await act(async () => {
      await result.current.save({ name: "A" });
    });
    expect(result.current.items[0]!.saved).toBe(true);

    // Edit the now-saved item → PATCH.
    act(() => result.current.openEdit(key));
    await act(async () => {
      await result.current.save({ name: "A-renamed" });
    });

    expect(update).toHaveBeenCalledWith("id-1", { name: "A-renamed" });
    expect(result.current.items[0]!.values.name).toBe("A-renamed");
  });

  it("save() editing an UNSAVED item POSTs (create) and marks it saved", async () => {
    const create = vi.fn<(v: Row) => Promise<string>>().mockResolvedValue("id-x");
    const { result } = renderHook(() =>
      useDraftList<Row>({ suggestions: [{ name: "A" }], create, update: vi.fn() }),
    );

    const key = result.current.items[0]!.key;
    act(() => result.current.openEdit(key));
    await act(async () => {
      await result.current.save({ name: "A-edited" });
    });

    expect(create).toHaveBeenCalledWith({ name: "A-edited" });
    expect(result.current.items[0]).toMatchObject({
      saved: true,
      id: "id-x",
      values: { name: "A-edited" },
    });
  });

  it("save() rethrows on create failure so the form surfaces it", async () => {
    const create = vi
      .fn<(v: Row) => Promise<string>>()
      .mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() =>
      useDraftList<Row>({ suggestions: [], create, update: vi.fn() }),
    );

    act(() => result.current.openAdd());
    await act(async () => {
      await expect(result.current.save({ name: "Z" })).rejects.toThrow("nope");
    });
    await waitFor(() => expect(result.current.error).toBe("nope"));
  });

  it("removeDraft() drops an unsaved item but leaves saved items", async () => {
    const create = vi.fn<(v: Row) => Promise<string>>().mockResolvedValue("id-1");
    const { result } = renderHook(() =>
      useDraftList<Row>({ suggestions: [{ name: "A" }, { name: "B" }], create, update: vi.fn() }),
    );

    const keyA = result.current.items[0]!.key;
    act(() => result.current.removeDraft(keyA));
    expect(result.current.items.map((it) => it.values.name)).toEqual(["B"]);
  });

  it("save() with a toStored mapper stores the mapped shape", async () => {
    const create = vi.fn<(v: Row) => Promise<string>>().mockResolvedValue("id-1");
    const { result } = renderHook(() =>
      useDraftList<Row, { raw: string }>({
        suggestions: [],
        create,
        update: vi.fn(),
        toStored: (s) => ({ name: s.raw.toUpperCase() }),
      }),
    );

    act(() => result.current.openAdd());
    await act(async () => {
      await result.current.save({ raw: "hello" });
    });

    expect(create).toHaveBeenCalledWith({ name: "HELLO" });
    expect(result.current.items[0]!.values).toEqual({ name: "HELLO" });
  });
});
