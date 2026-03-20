/**
 * PDF export utilities — generates financial report PDFs using jsPDF.
 * Works client-side. Handles P&L, Cash Flow, Balance Sheet, and Runway reports.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ───────────────────────────────────────────────────────────────────

interface StatementLineItem {
  name: string;
  values: { month: string; value: number }[];
  children?: StatementLineItem[];
}

interface PDFReportOptions {
  title: string;
  subtitle?: string;
  companyName: string;
  scenarioName: string;
  generatedAt?: Date;
}

// ── Formatting ──────────────────────────────────────────────────────────────

function fmtCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtFullCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtMonthHeader(monthKey: string): string {
  const parts = monthKey.split("-");
  const year = parts[0] ?? "";
  const month = parts[1] ?? "0";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month, 10) - 1]} '${year.slice(2)}`;
}

// ── PDF Header ──────────────────────────────────────────────────────────────

function addPDFHeader(doc: jsPDF, opts: PDFReportOptions) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const date = opts.generatedAt ?? new Date();

  // Brand bar
  doc.setFillColor(37, 99, 235); // brand-600
  doc.rect(0, 0, pageWidth, 3, "F");

  // Company name
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // surface-500
  doc.text(opts.companyName, 20, 18);

  // Title
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42); // surface-900
  doc.text(opts.title, 20, 30);

  // Subtitle + date
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const subtitle = opts.subtitle ?? `${opts.scenarioName} scenario`;
  doc.text(subtitle, 20, 38);
  doc.text(`Generated ${date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, pageWidth - 20, 38, { align: "right" });

  // Divider
  doc.setDrawColor(226, 232, 240); // surface-200
  doc.line(20, 42, pageWidth - 20, 42);
}

function addPDFFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Burnless Financial Report", 20, pageHeight - 10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 20, pageHeight - 10, { align: "right" });
  }
}

// ── Statement Table Rendering ───────────────────────────────────────────────

function renderStatementTable(
  doc: jsPDF,
  rows: Array<{ item: StatementLineItem; isSummary?: boolean; isSubtotal?: boolean }>,
  startY: number,
  sectionTitle?: string
): number {
  if (rows.length === 0) return startY;

  const months = rows[0]?.item.values.map((v) => v.month) ?? [];
  const headers = [sectionTitle ?? "", ...months.map(fmtMonthHeader)];

  const body: Array<Array<{ content: string; styles?: Record<string, unknown> }>> = [];

  for (const row of rows) {
    const cells = [
      {
        content: row.item.name,
        styles: {
          fontStyle: row.isSummary ? "bold" as const : row.isSubtotal ? "bold" as const : "normal" as const,
          textColor: row.isSummary ? [15, 23, 42] : row.isSubtotal ? [30, 41, 59] : [71, 85, 105],
        },
      },
      ...row.item.values.map((v) => ({
        content: fmtFullCurrency(v.value),
        styles: {
          halign: "right" as const,
          fontStyle: row.isSummary ? "bold" as const : "normal" as const,
          textColor: v.value < 0 ? [220, 38, 38] : row.isSummary ? [15, 23, 42] : [71, 85, 105],
        },
      })),
    ];
    body.push(cells);

    // Add children (detail lines) if available
    if (row.item.children) {
      for (const child of row.item.children) {
        body.push([
          {
            content: `    ${child.name}`,
            styles: { textColor: [148, 163, 184], fontSize: 7 },
          },
          ...child.values.map((v) => ({
            content: fmtFullCurrency(v.value),
            styles: {
              halign: "right" as const,
              textColor: v.value < 0 ? [220, 38, 38] : [148, 163, 184],
              fontSize: 7,
            },
          })),
        ]);
      }
    }
  }

  autoTable(doc, {
    startY,
    head: [headers.map((h, i) => ({
      content: h,
      styles: {
        halign: i === 0 ? "left" as const : "right" as const,
        fillColor: [248, 250, 252],
        textColor: [71, 85, 105],
        fontSize: 7,
        fontStyle: "bold" as const,
      },
    }))],
    body: body as unknown as Array<Array<string | { content: string; styles?: Record<string, unknown> }>>,
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineColor: [241, 245, 249],
      lineWidth: 0.1,
    },
    theme: "plain",
    margin: { left: 20, right: 20 },
  });

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

// ── Report Generators ───────────────────────────────────────────────────────

export function generateProfitLossPDF(
  profitAndLoss: {
    revenue: StatementLineItem;
    cogs: StatementLineItem;
    grossProfit: StatementLineItem;
    operatingExpenses: StatementLineItem;
    operatingIncome: StatementLineItem;
    otherIncome: StatementLineItem;
    otherExpenses: StatementLineItem;
    netIncome: StatementLineItem;
  },
  opts: PDFReportOptions
): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  addPDFHeader(doc, { ...opts, title: opts.title || "Profit & Loss Statement" });

  renderStatementTable(
    doc,
    [
      { item: profitAndLoss.revenue },
      { item: profitAndLoss.cogs },
      { item: profitAndLoss.grossProfit, isSubtotal: true },
      { item: profitAndLoss.operatingExpenses },
      { item: profitAndLoss.operatingIncome, isSubtotal: true },
      { item: profitAndLoss.otherIncome },
      { item: profitAndLoss.otherExpenses },
      { item: profitAndLoss.netIncome, isSummary: true },
    ],
    52,
    "Income Statement"
  );

  addPDFFooter(doc);
  return doc;
}

export function generateCashFlowPDF(
  cashFlow: {
    operatingCashFlow: StatementLineItem;
    investingCashFlow: StatementLineItem;
    financingCashFlow: StatementLineItem;
    netCashChange: StatementLineItem;
    endingCash: { month: string; value: number }[];
  },
  opts: PDFReportOptions
): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  addPDFHeader(doc, { ...opts, title: opts.title || "Cash Flow Statement" });

  const endingCashItem: StatementLineItem = {
    name: "Ending Cash Position",
    values: cashFlow.endingCash,
  };

  renderStatementTable(
    doc,
    [
      { item: cashFlow.operatingCashFlow },
      { item: cashFlow.investingCashFlow },
      { item: cashFlow.financingCashFlow },
      { item: cashFlow.netCashChange, isSubtotal: true },
      { item: endingCashItem, isSummary: true },
    ],
    52,
    "Cash Flow"
  );

  addPDFFooter(doc);
  return doc;
}

export function generateBalanceSheetPDF(
  balanceSheet: {
    assets: StatementLineItem;
    liabilities: StatementLineItem;
    equity: StatementLineItem;
  },
  opts: PDFReportOptions
): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  addPDFHeader(doc, { ...opts, title: opts.title || "Balance Sheet" });

  renderStatementTable(
    doc,
    [
      { item: balanceSheet.assets },
      { item: balanceSheet.liabilities },
      { item: balanceSheet.equity, isSummary: true },
    ],
    52,
    "Balance Sheet"
  );

  addPDFFooter(doc);
  return doc;
}

export function generateRunwaySummaryPDF(
  data: {
    startingCash: number;
    netBurnRate: number;
    grossBurnRate: number;
    runwayMonths: number;
    cashPosition: { month: string; value: number }[];
  },
  opts: PDFReportOptions
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  addPDFHeader(doc, { ...opts, title: opts.title || "Runway Summary" });

  let y = 60;

  // Key metrics cards
  const metrics = [
    { label: "Starting Cash", value: fmtCurrency(data.startingCash) },
    { label: "Monthly Burn (Net)", value: fmtCurrency(data.netBurnRate) },
    { label: "Monthly Burn (Gross)", value: fmtCurrency(data.grossBurnRate) },
    { label: "Runway", value: data.runwayMonths > 36 ? "36+ months" : `${data.runwayMonths} months` },
  ];

  for (const metric of metrics) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(metric.label, 20, y);
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(metric.value, 20, y + 18);
    y += 36;
  }

  y += 10;

  // Cash position table
  if (data.cashPosition.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Month", "Cash Position"]],
      body: data.cashPosition.map((cp) => [
        fmtMonthHeader(cp.month),
        fmtFullCurrency(cp.value),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [71, 85, 105],
        fontStyle: "bold",
      },
      columnStyles: {
        1: { halign: "right" },
      },
      theme: "plain",
      margin: { left: 20, right: 20 },
    });
  }

  addPDFFooter(doc);
  return doc;
}

/**
 * Generate an investor data room PDF — a comprehensive financial summary
 * combining key metrics, P&L, cash flow, and runway in one document.
 */
export function generateInvestorDataRoomPDF(
  data: {
    companyName: string;
    scenarioName: string;
    profitAndLoss: {
      revenue: StatementLineItem;
      cogs: StatementLineItem;
      grossProfit: StatementLineItem;
      operatingExpenses: StatementLineItem;
      operatingIncome: StatementLineItem;
      otherIncome: StatementLineItem;
      otherExpenses: StatementLineItem;
      netIncome: StatementLineItem;
    };
    cashFlow: {
      operatingCashFlow: StatementLineItem;
      investingCashFlow: StatementLineItem;
      financingCashFlow: StatementLineItem;
      netCashChange: StatementLineItem;
      endingCash: { month: string; value: number }[];
    };
    balanceSheet: {
      assets: StatementLineItem;
      liabilities: StatementLineItem;
      equity: StatementLineItem;
    };
    keyMetrics: {
      label: string;
      value: string;
      category: string;
    }[];
    startingCash: number;
    netBurnRate: number;
    runwayMonths: number;
  }
): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Cover page / Header ────────────────────────────────────────────────
  addPDFHeader(doc, {
    title: "Investor Data Room",
    subtitle: "Financial Summary & Projections",
    companyName: data.companyName,
    scenarioName: data.scenarioName,
  });

  // Key metrics summary
  let y = 60;
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Key Financial Metrics", 20, y);
  y += 8;

  const metricsByCategory = new Map<string, Array<{ label: string; value: string }>>();
  for (const m of data.keyMetrics) {
    if (!metricsByCategory.has(m.category)) metricsByCategory.set(m.category, []);
    metricsByCategory.get(m.category)!.push(m);
  }

  const metricsBody: string[][] = [];
  for (const [category, metrics] of metricsByCategory) {
    metricsBody.push([category.toUpperCase(), "", ""]);
    for (const m of metrics) {
      metricsBody.push(["", m.label, m.value]);
    }
  }

  autoTable(doc, {
    startY: y,
    body: metricsBody,
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 120 },
      1: { cellWidth: 200 },
      2: { halign: "right" },
    },
    theme: "plain",
    margin: { left: 20, right: 20 },
  });

  // ── P&L page ───────────────────────────────────────────────────────────
  doc.addPage("a4", "landscape");
  addPDFHeader(doc, {
    title: "Profit & Loss Statement",
    companyName: data.companyName,
    scenarioName: data.scenarioName,
  });

  renderStatementTable(
    doc,
    [
      { item: data.profitAndLoss.revenue },
      { item: data.profitAndLoss.cogs },
      { item: data.profitAndLoss.grossProfit, isSubtotal: true },
      { item: data.profitAndLoss.operatingExpenses },
      { item: data.profitAndLoss.operatingIncome, isSubtotal: true },
      { item: data.profitAndLoss.netIncome, isSummary: true },
    ],
    52,
    "Income Statement"
  );

  // ── Cash Flow page ─────────────────────────────────────────────────────
  doc.addPage("a4", "landscape");
  addPDFHeader(doc, {
    title: "Cash Flow Statement",
    companyName: data.companyName,
    scenarioName: data.scenarioName,
  });

  const endingCashItem: StatementLineItem = {
    name: "Ending Cash Position",
    values: data.cashFlow.endingCash,
  };

  renderStatementTable(
    doc,
    [
      { item: data.cashFlow.operatingCashFlow },
      { item: data.cashFlow.investingCashFlow },
      { item: data.cashFlow.financingCashFlow },
      { item: data.cashFlow.netCashChange, isSubtotal: true },
      { item: endingCashItem, isSummary: true },
    ],
    52,
    "Cash Flow"
  );

  // ── Balance Sheet page ─────────────────────────────────────────────────
  doc.addPage("a4", "landscape");
  addPDFHeader(doc, {
    title: "Balance Sheet",
    companyName: data.companyName,
    scenarioName: data.scenarioName,
  });

  renderStatementTable(
    doc,
    [
      { item: data.balanceSheet.assets },
      { item: data.balanceSheet.liabilities },
      { item: data.balanceSheet.equity, isSummary: true },
    ],
    52,
    "Balance Sheet"
  );

  addPDFFooter(doc);
  return doc;
}

/**
 * Trigger a PDF download in the browser.
 */
export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(`${filename}.pdf`);
}
