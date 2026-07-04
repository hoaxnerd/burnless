import { describe, it, expect } from "vitest";
import { diffText, contentChangeAlert } from "../text-diff";

describe("diffText", () => {
  it("reports added and removed lines by multiset difference", () => {
    const d = diffText("Free\nPro $29\nEnterprise", "Free\nPro $39\nEnterprise\nTeam");
    expect(d.removedLines).toEqual(["Pro $29"]);
    expect(d.addedLines).toEqual(["Pro $39", "Team"]);
    expect(d.removedCount).toBe(1);
    expect(d.addedCount).toBe(2);
    expect(d.truncated).toBe(false);
  });

  it("treats identical content (any order) as no change", () => {
    const d = diffText("A\nB\nC", "C\nB\nA");
    expect(d.addedCount).toBe(0);
    expect(d.removedCount).toBe(0);
  });

  it("handles empty previous (first snapshot)", () => {
    const d = diffText("", "Only");
    expect(d.addedLines).toEqual(["Only"]);
    expect(d.removedCount).toBe(0);
  });

  it("caps displayed lines at 20 and flags truncation", () => {
    const next = Array.from({ length: 25 }, (_, i) => `L${i}`).join("\n");
    const d = diffText("", next);
    expect(d.addedCount).toBe(25);
    expect(d.addedLines).toHaveLength(20);
    expect(d.truncated).toBe(true);
  });
});

describe("contentChangeAlert", () => {
  it("returns null when nothing changed", () => {
    expect(contentChangeAlert(diffText("A", "A"), "Pricing page")).toBeNull();
  });

  it("builds an info alert with counts and capped line snippets", () => {
    const alert = contentChangeAlert(diffText("Pro 29", "Pro 39"), "Pricing page");
    expect(alert).not.toBeNull();
    expect(alert!.changeType).toBe("content_changed");
    expect(alert!.severity).toBe("info");
    expect(alert!.summary).toBe("Pricing page content changed: +1 / -1 lines");
    expect(alert!.before).toEqual({ lines: ["Pro 29"], truncated: false });
    expect(alert!.after).toEqual({ lines: ["Pro 39"], truncated: false });
  });
});
