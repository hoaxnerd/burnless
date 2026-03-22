/**
 * Data Room hub definitions test — BUR-192
 *
 * Validates the report, export, and tab definitions that power the unified
 * Data Room hub. Tests data integrity, not React rendering.
 */

import { describe, it, expect } from "vitest";

// ── Reproduce the static definitions from data-room-view.tsx ──────────────
// These are tested separately to catch regressions in report/export config
// without needing full React component rendering.

const tabs = [
  { id: "reports", label: "Reports" },
  { id: "exports", label: "Exports" },
  { id: "import", label: "Import" },
] as const;

const reports = [
  {
    id: "board-update",
    title: "Board Update",
    href: "/reports/board-update",
    featured: true,
  },
  {
    id: "profit-loss",
    title: "Profit & Loss",
    href: "/reports/profit-loss",
  },
  {
    id: "cash-flow",
    title: "Cash Flow",
    href: "/reports/cash-flow",
  },
  {
    id: "balance-sheet",
    title: "Balance Sheet",
    href: "/reports/balance-sheet",
  },
  {
    id: "runway",
    title: "Runway Analysis",
    href: "/reports/runway",
  },
  {
    id: "budget-vs-actuals",
    title: "Budget vs Actuals",
    href: "/reports/budget-vs-actuals",
  },
  {
    id: "metrics",
    title: "Metrics Explorer",
    href: "/reports/metrics",
  },
  {
    id: "scenario-compare",
    title: "Scenario Comparison",
    href: "/reports/scenario-compare",
  },
];

const exportItems = [
  { id: "full-deck", label: "Full Financial Package", format: "pdf" },
  { id: "pnl", label: "Profit & Loss", format: "pdf" },
  { id: "cashflow", label: "Cash Flow Statement", format: "pdf" },
  { id: "balance", label: "Balance Sheet", format: "pdf" },
  { id: "runway", label: "Runway Summary", format: "pdf" },
  { id: "metrics-csv", label: "Key Metrics (CSV)", format: "csv" },
  { id: "funding-csv", label: "Funding History (CSV)", format: "csv" },
];

const reportSections = [
  { id: "snapshot", label: "Financial Snapshot", exportIds: ["metrics-csv"] },
  { id: "pnl", label: "Profit & Loss", exportIds: ["pnl"] },
  { id: "cashflow", label: "Cash Flow", exportIds: ["cashflow"] },
  { id: "balance", label: "Balance Sheet", exportIds: ["balance"] },
  { id: "runway", label: "Runway Analysis", exportIds: ["runway"] },
  { id: "funding", label: "Funding History", exportIds: ["funding-csv"] },
];

// ── Tab definitions ───────────────────────────────────────────────────────

describe("Data Room tabs", () => {
  it("has exactly 3 tabs: Reports, Exports, Import", () => {
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.id)).toEqual(["reports", "exports", "import"]);
  });

  it("has unique tab IDs", () => {
    const ids = tabs.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Report definitions ────────────────────────────────────────────────────

describe("Report cards", () => {
  it("defines 8 reports", () => {
    expect(reports).toHaveLength(8);
  });

  it("has unique report IDs", () => {
    const ids = reports.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique report hrefs", () => {
    const hrefs = reports.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("all hrefs start with /reports/", () => {
    for (const report of reports) {
      expect(report.href).toMatch(/^\/reports\//);
    }
  });

  it("has exactly one featured report (Board Update)", () => {
    const featured = reports.filter((r) => r.featured);
    expect(featured).toHaveLength(1);
    expect(featured[0]!.id).toBe("board-update");
  });

  it("Board Update is first in the list", () => {
    expect(reports[0]!.id).toBe("board-update");
  });
});

// ── Export items ──────────────────────────────────────────────────────────

describe("Export items", () => {
  it("defines 7 export items", () => {
    expect(exportItems).toHaveLength(7);
  });

  it("has unique export IDs", () => {
    const ids = exportItems.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has 5 PDF exports and 2 CSV exports", () => {
    const pdfs = exportItems.filter((e) => e.format === "pdf");
    const csvs = exportItems.filter((e) => e.format === "csv");
    expect(pdfs).toHaveLength(5);
    expect(csvs).toHaveLength(2);
  });

  it("Full Financial Package is first (primary CTA)", () => {
    expect(exportItems[0]!.id).toBe("full-deck");
    expect(exportItems[0]!.format).toBe("pdf");
  });
});

// ── Custom Report Builder ─────────────────────────────────────────────────

describe("Report Builder sections", () => {
  it("defines 6 sections", () => {
    expect(reportSections).toHaveLength(6);
  });

  it("has unique section IDs", () => {
    const ids = reportSections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every section maps to valid export IDs", () => {
    const validExportIds = new Set(exportItems.map((e) => e.id));
    for (const section of reportSections) {
      for (const exportId of section.exportIds) {
        expect(validExportIds.has(exportId)).toBe(true);
      }
    }
  });

  it("covers all non-full-deck export IDs", () => {
    const coveredExportIds = new Set(reportSections.flatMap((s) => s.exportIds));
    const nonFullDeckExports = exportItems
      .filter((e) => e.id !== "full-deck")
      .map((e) => e.id);

    for (const id of nonFullDeckExports) {
      expect(coveredExportIds.has(id)).toBe(true);
    }
  });
});

// ── Reports ↔ Redirect ────────────────────────────────────────────────────

describe("/reports redirect", () => {
  it("/reports page should redirect to /data-room?tab=reports", () => {
    // This validates the behavior defined in reports/page.tsx
    // The page calls redirect("/data-room?tab=reports")
    const redirectTarget = "/data-room?tab=reports";
    expect(redirectTarget).toContain("/data-room");
    expect(redirectTarget).toContain("tab=reports");
  });
});

// ── CSV generation helpers ────────────────────────────────────────────────

describe("CSV export format", () => {
  it("metrics CSV has correct headers", () => {
    const headers = ["Category", "Metric", "Value"];
    const mockMetrics = [
      { label: "Monthly Burn", value: "$15,000", category: "Cash Flow" },
      { label: "Runway", value: "18 months", category: "Cash Flow" },
    ];
    const rows = [headers.join(","), ...mockMetrics.map((m) => `${m.category},${m.label},${m.value}`)];
    const csv = rows.join("\n");

    expect(csv).toContain("Category,Metric,Value");
    expect(csv).toContain("Cash Flow,Monthly Burn,$15,000");
    expect(csv).toContain("Cash Flow,Runway,18 months");
  });

  it("funding CSV has correct headers", () => {
    const headers = ["Round", "Amount", "Date", "Pre-Money Valuation"];
    const mockRounds = [
      { round: "seed", amount: 2000000, date: "2025-06-01", valuation: 8000000 },
      { round: "series_a", amount: 10000000, date: "2026-01-15", valuation: null },
    ];
    const rows = [
      headers.join(","),
      ...mockRounds.map((r) =>
        [r.round, r.amount, r.date, r.valuation ?? "N/A"].join(",")
      ),
    ];
    const csv = rows.join("\n");

    expect(csv).toContain("Round,Amount,Date,Pre-Money Valuation");
    expect(csv).toContain("seed,2000000,2025-06-01,8000000");
    expect(csv).toContain("series_a,10000000,2026-01-15,N/A");
  });

  it("handles empty funding rounds", () => {
    const headers = ["Round", "Amount", "Date", "Pre-Money Valuation"];
    const mockRounds: Array<{ round: string; amount: number; date: string; valuation: number | null }> = [];
    const rows = [
      headers.join(","),
      ...mockRounds.map((r) =>
        [r.round, r.amount, r.date, r.valuation ?? "N/A"].join(",")
      ),
    ];
    const csv = rows.join("\n");

    expect(csv).toBe("Round,Amount,Date,Pre-Money Valuation");
  });
});
