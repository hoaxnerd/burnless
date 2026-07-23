import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompetitorAnalysisBody } from "../competitor-analysis-body";

// WidgetCard (design-system) calls useRouter — mount a stub app router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

// happy-dom + SWR fallbackData → no fetch needed.
const base = {
  competitor: { id: "c1", name: "Acme", url: "https://acme.com" },
  sources: [
    { id: "s1", type: "page", url: "https://acme.com/x", enabled: true, lastRunAt: null, lastStatus: null, healthState: "ok" },
  ],
  latestSnapshots: [null],
};

describe("CompetitorAnalysisBody", () => {
  it("renders a content_changed row with its summary and an expandable snippet", () => {
    const initialChanges = {
      changes: [
        {
          id: "ch1", competitorId: "c1", sourceId: "s1", snapshotId: "sn1", companyId: "co1",
          detectedAt: new Date("2026-07-01").toISOString(),
          changeType: "content_changed",
          summary: "Page content changed: +1 / -1 lines",
          before: { lines: ["Old line"], truncated: false },
          after: { lines: ["New line"], truncated: false },
          severity: "info", acknowledgedAt: null, createdAt: new Date("2026-07-01").toISOString(),
        },
      ],
    };
    render(<CompetitorAnalysisBody {...base} initialChanges={initialChanges} />);
    expect(screen.getByText(/Page content changed/)).toBeTruthy();
    // Disclosure content present (details/summary): added + removed lines.
    // The snippet renders each line with a diff prefix ("+ New line" / "- Old
    // line"), so match with a regex rather than an exact string.
    expect(screen.getByText(/New line/)).toBeTruthy();
    expect(screen.getByText(/Old line/)).toBeTruthy();
  });

  it("renders Recent posts from a feed snapshot and Pages-tracked from a sitemap snapshot", () => {
    const props = {
      competitor: { id: "c1", name: "Acme", url: "https://acme.com" },
      sources: [
        { id: "f1", type: "feed", url: "https://acme.com/rss", enabled: true, lastRunAt: null, lastStatus: null, healthState: "ok" },
        { id: "m1", type: "sitemap", url: "https://acme.com/sitemap.xml", enabled: true, lastRunAt: null, lastStatus: null, healthState: "ok" },
      ],
      latestSnapshots: [
        { id: "sn1", sourceId: "f1", capturedAt: new Date("2026-07-01").toISOString(), structured: { items: { g1: { title: "Launch Day", link: "https://acme.com/p/1", publishedAt: new Date("2026-07-01").toISOString() } } } },
        { id: "sn2", sourceId: "m1", capturedAt: new Date("2026-07-01").toISOString(), structured: { urls: { "https://acme.com/": 1, "https://acme.com/pricing": 1 }, count: 2 } },
      ],
      initialChanges: { changes: [] },
    };
    render(<CompetitorAnalysisBody {...props} />);
    expect(screen.getByText("Launch Day")).toBeTruthy();
    expect(screen.getByText(/Pages tracked/i)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
});
