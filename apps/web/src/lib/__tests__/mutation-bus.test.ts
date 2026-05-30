import { describe, it, expect, vi, beforeEach } from "vitest";
import { subscribeMutation, publishMutation, domainFromUrl, MUTATION_SYNC_KEY } from "../mutation-bus";

beforeEach(() => { localStorage.clear(); });

describe("mutation-bus", () => {
  it("delivers same-tab events to subscribers", () => {
    const seen: unknown[] = [];
    const off = subscribeMutation((e) => seen.push(e));
    publishMutation({ domain: "expenses", method: "PATCH", at: 1 });
    off();
    expect(seen).toEqual([{ domain: "expenses", method: "PATCH", at: 1 }]);
  });

  it("writes a localStorage tick for cross-tab propagation", () => {
    publishMutation({ domain: "team", method: "POST", at: 2 });
    const raw = localStorage.getItem(MUTATION_SYNC_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toMatchObject({ domain: "team", method: "POST" });
  });

  it("re-dispatches a storage event from another tab tagged crossTab", () => {
    const seen: Array<{ crossTab?: boolean }> = [];
    const off = subscribeMutation((e) => seen.push(e));
    window.dispatchEvent(new StorageEvent("storage", {
      key: MUTATION_SYNC_KEY,
      newValue: JSON.stringify({ domain: "revenue", method: "POST", at: 3 }),
    }));
    off();
    expect(seen).toEqual([{ domain: "revenue", method: "POST", at: 3, crossTab: true }]);
  });

  it("unsubscribe stops delivery", () => {
    const seen: unknown[] = [];
    const off = subscribeMutation((e) => seen.push(e));
    off();
    publishMutation({ domain: "funding", method: "DELETE", at: 4 });
    expect(seen).toEqual([]);
  });

  it("derives domain from url", () => {
    expect(domainFromUrl("/api/forecast-lines/abc")).toBe("expenses");
    expect(domainFromUrl("/api/transactions")).toBe("expenses");
    expect(domainFromUrl("/api/headcount/1/bonuses")).toBe("team");
    expect(domainFromUrl("/api/revenue-streams")).toBe("revenue");
    expect(domainFromUrl("/api/funding-rounds/1/investors")).toBe("funding");
    expect(domainFromUrl("/api/scenarios/1")).toBe("scenario");
    expect(domainFromUrl("/api/user-preferences")).toBe("other");
  });
});
