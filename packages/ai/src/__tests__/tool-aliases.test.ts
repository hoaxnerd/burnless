import { describe, it, expect } from "vitest";
import { TOOL_NAME_ALIASES, canonicalToolName } from "../tool-aliases";

describe("tool name aliases", () => {
  it("maps every retired name to a non-empty canonical name", () => {
    for (const [oldName, newName] of Object.entries(TOOL_NAME_ALIASES)) {
      expect(oldName).not.toBe(newName); // an alias must actually change something
      expect(newName.length).toBeGreaterThan(0);
    }
  });

  it("canonicalizes retired names", () => {
    expect(canonicalToolName("create_expense")).toBe("create_forecast_line");
    expect(canonicalToolName("forecast_revenue")).toBe("get_revenue_projection");
    expect(canonicalToolName("search")).toBe("search_web");
    expect(canonicalToolName("web_search")).toBe("search_web");
    expect(canonicalToolName("crawl")).toBe("read_webpage");
    expect(canonicalToolName("browser_use")).toBe("read_webpage_rendered");
  });

  it("returns unknown / already-current names unchanged", () => {
    expect(canonicalToolName("create_scenario")).toBe("create_scenario");
    expect(canonicalToolName("get_metrics")).toBe("get_metrics");
    expect(canonicalToolName("totally_unknown")).toBe("totally_unknown");
  });
});
