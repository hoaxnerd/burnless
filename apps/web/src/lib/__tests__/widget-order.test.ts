import { describe, expect, it } from "vitest";
import {
  deriveWidgetOrder,
  resolveOrder,
  type StoredPageLayout,
} from "../widget-order";

describe("deriveWidgetOrder", () => {
  it("returns [] for null/undefined/empty", () => {
    expect(deriveWidgetOrder(null)).toEqual([]);
    expect(deriveWidgetOrder(undefined)).toEqual([]);
    expect(deriveWidgetOrder({})).toEqual([]);
  });

  it("prefers the new `order` field verbatim", () => {
    const data: StoredPageLayout = { order: ["a", "b", "c"] };
    expect(deriveWidgetOrder(data)).toEqual(["a", "b", "c"]);
  });

  it("derives order from a legacy coordinate layout (sort by y, then x)", () => {
    const data: StoredPageLayout = {
      layout: [
        { widgetId: "bottom", x: 0, y: 10 },
        { widgetId: "top-right", x: 6, y: 0 },
        { widgetId: "top-left", x: 0, y: 0 },
      ],
    };
    expect(deriveWidgetOrder(data)).toEqual(["top-left", "top-right", "bottom"]);
  });

  it("treats missing x/y as 0 without throwing", () => {
    const data: StoredPageLayout = {
      layout: [{ widgetId: "a" }, { widgetId: "b", y: 1 }],
    };
    expect(deriveWidgetOrder(data)).toEqual(["a", "b"]);
  });

  it("ignores legacy layout when `order` is present", () => {
    const data: StoredPageLayout = {
      order: ["x"],
      layout: [{ widgetId: "y", x: 0, y: 0 }],
    };
    expect(deriveWidgetOrder(data)).toEqual(["x"]);
  });
});

describe("resolveOrder", () => {
  const available = ["a", "b", "c", "d"];

  it("falls back to default order when nothing saved", () => {
    expect(resolveOrder([], ["a", "b", "c", "d"], available)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("keeps saved positions and appends new widgets in default order", () => {
    // user saved a custom order before "d" existed
    expect(resolveOrder(["c", "a", "b"], ["a", "b", "c", "d"], available)).toEqual(
      ["c", "a", "b", "d"]
    );
  });

  it("drops stale ids no longer available", () => {
    expect(
      resolveOrder(["ghost", "b", "a"], ["a", "b", "c", "d"], available)
    ).toEqual(["b", "a", "c", "d"]);
  });

  it("dedupes repeated ids", () => {
    expect(resolveOrder(["a", "a", "b"], ["a", "b"], ["a", "b"])).toEqual([
      "a",
      "b",
    ]);
  });
});
