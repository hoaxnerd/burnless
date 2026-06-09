/**
 * PDF export utilities — generates financial report PDFs using jsPDF.
 * Works client-side. Handles P&L, Cash Flow, Balance Sheet, and Runway reports.
 * jsPDF (~336KB) is lazy-loaded only when a PDF generation function is called.
 */

import type jsPDFType from "jspdf";
import { formatCurrency, formatCompactAmount, formatMonthKey, formatDate, type CurrencyCode } from "@burnless/types";

// Lazy-load jsPDF + autoTable only when PDF generation is triggered
async function loadJsPDF() {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable };
}

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
  currency?: CurrencyCode;
  locale?: string;
}

// ── Formatting ──────────────────────────────────────────────────────────────

function fmtCurrency(value: number, currency: CurrencyCode = "USD", locale?: string): string {
  return formatCompactAmount(value, currency, locale);
}

function fmtFullCurrency(value: number, currency: CurrencyCode = "USD", locale?: string): string {
  return formatCurrency(value, currency, locale);
}

function fmtMonthHeader(monthKey: string, locale?: string): string {
  return formatMonthKey(monthKey, locale, { includeYear: true });
}

// ── PDF Header ──────────────────────────────────────────────────────────────

function addPDFHeader(doc: jsPDFType, opts: PDFReportOptions) {
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
  doc.text(opts.title, 20, 36);

  // Subtitle + date
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const subtitle = opts.subtitle ?? `${opts.scenarioName} scenario`;
  doc.text(subtitle, 20, 50);
  doc.text(`Generated ${formatDate(date, opts.locale, { year: "numeric", month: "long", day: "numeric" })}`, pageWidth - 20, 50, { align: "right" });

  // Divider
  doc.setDrawColor(226, 232, 240); // surface-200
  doc.line(20, 56, pageWidth - 20, 56);
}

function addPDFFooter(doc: jsPDFType) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("burnless Financial Report", 20, pageHeight - 10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 20, pageHeight - 10, { align: "right" });
  }
}

// ── Statement Table Rendering ───────────────────────────────────────────────

function renderStatementTable(
  doc: jsPDFType,
  autoTable: typeof import("jspdf-autotable").default,
  rows: Array<{ item: StatementLineItem; isSummary?: boolean; isSubtotal?: boolean }>,
  startY: number,
  sectionTitle?: string,
  currencyLocale?: { currency?: CurrencyCode; locale?: string },
  headerOpts?: PDFReportOptions
): number {
  if (rows.length === 0) return startY;

  const currency = currencyLocale?.currency ?? "USD";
  const locale = currencyLocale?.locale;

  const months = rows[0]?.item.values.map((v) => v.month) ?? [];
  const headers = [sectionTitle ?? "", ...months.map((m) => fmtMonthHeader(m, locale))];

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
        content: fmtFullCurrency(v.value, currency, locale),
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
            content: fmtFullCurrency(v.value, currency, locale),
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
    showHead: "everyPage",
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineColor: [241, 245, 249],
      lineWidth: 0.1,
    },
    theme: "plain",
    margin: { left: 20, right: 20, top: headerOpts ? 66 : 20 },
    didDrawPage: headerOpts
      ? (hookData: { pageNumber: number }) => {
          // Page 1 already has a header drawn by the caller; only draw on overflow pages
          if (hookData.pageNumber > 1) {
            addPDFHeader(doc, headerOpts);
          }
        }
      : undefined,
  });

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

// ── Report Generators ───────────────────────────────────────────────────────

export async function generateProfitLossPDF(
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
): Promise<jsPDFType> {
  const { jsPDF, autoTable } = await loadJsPDF();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  addPDFHeader(doc, { ...opts, title: opts.title || "Profit & Loss Statement" });

  const pdfHeaderOpts = { ...opts, title: opts.title || "Profit & Loss Statement" };

  renderStatementTable(
    doc,
    autoTable,
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
    66,
    "Income Statement",
    { currency: opts.currency, locale: opts.locale },
    pdfHeaderOpts
  );

  addPDFFooter(doc);
  return doc;
}

export async function generateCashFlowPDF(
  cashFlow: {
    operatingCashFlow: StatementLineItem;
    investingCashFlow: StatementLineItem;
    financingCashFlow: StatementLineItem;
    netCashChange: StatementLineItem;
    endingCash: { month: string; value: number }[];
  },
  opts: PDFReportOptions
): Promise<jsPDFType> {
  const { jsPDF, autoTable } = await loadJsPDF();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const cfHeaderOpts = { ...opts, title: opts.title || "Cash Flow Statement" };
  addPDFHeader(doc, cfHeaderOpts);

  const endingCashItem: StatementLineItem = {
    name: "Ending Cash Position",
    values: cashFlow.endingCash,
  };

  renderStatementTable(
    doc,
    autoTable,
    [
      { item: cashFlow.operatingCashFlow },
      { item: cashFlow.investingCashFlow },
      { item: cashFlow.financingCashFlow },
      { item: cashFlow.netCashChange, isSubtotal: true },
      { item: endingCashItem, isSummary: true },
    ],
    66,
    "Cash Flow",
    { currency: opts.currency, locale: opts.locale },
    cfHeaderOpts
  );

  addPDFFooter(doc);
  return doc;
}

export async function generateBalanceSheetPDF(
  balanceSheet: {
    assets: StatementLineItem;
    liabilities: StatementLineItem;
    equity: StatementLineItem;
  },
  opts: PDFReportOptions
): Promise<jsPDFType> {
  const { jsPDF, autoTable } = await loadJsPDF();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const bsHeaderOpts = { ...opts, title: opts.title || "Balance Sheet" };
  addPDFHeader(doc, bsHeaderOpts);

  renderStatementTable(
    doc,
    autoTable,
    [
      { item: balanceSheet.assets },
      { item: balanceSheet.liabilities },
      { item: balanceSheet.equity, isSummary: true },
    ],
    66,
    "Balance Sheet",
    { currency: opts.currency, locale: opts.locale },
    bsHeaderOpts
  );

  addPDFFooter(doc);
  return doc;
}

export async function generateRunwaySummaryPDF(
  data: {
    startingCash: number;
    netBurnRate: number;
    grossBurnRate: number;
    runwayMonths: number;
    cashPosition: { month: string; value: number }[];
  },
  opts: PDFReportOptions
): Promise<jsPDFType> {
  const { jsPDF, autoTable } = await loadJsPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  addPDFHeader(doc, { ...opts, title: opts.title || "Runway Summary" });

  let y = 76;

  const currency = opts.currency ?? "USD";
  const locale = opts.locale;

  // Key metrics cards
  const metrics = [
    { label: "Starting Cash", value: fmtCurrency(data.startingCash, currency, locale) },
    { label: "Monthly Burn (Net)", value: fmtCurrency(data.netBurnRate, currency, locale) },
    { label: "Monthly Burn (Gross)", value: fmtCurrency(data.grossBurnRate, currency, locale) },
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
        fmtMonthHeader(cp.month, locale),
        fmtFullCurrency(cp.value, currency, locale),
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
export async function generateInvestorDataRoomPDF(
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
    currency?: CurrencyCode;
    locale?: string;
  }
): Promise<jsPDFType> {
  const { jsPDF, autoTable } = await loadJsPDF();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const currency = data.currency ?? "USD";
  const locale = data.locale;
  const clOpts = { currency: data.currency, locale: data.locale };

  // ── Cover page / Header ────────────────────────────────────────────────
  addPDFHeader(doc, {
    title: "Investor Data Room",
    subtitle: "Financial Summary & Projections",
    companyName: data.companyName,
    scenarioName: data.scenarioName,
    currency,
    locale,
  });

  // Key metrics summary
  let y = 76;
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
  const pnlHdrOpts: PDFReportOptions = {
    title: "Profit & Loss Statement",
    companyName: data.companyName,
    scenarioName: data.scenarioName,
    currency,
    locale,
  };
  addPDFHeader(doc, pnlHdrOpts);

  renderStatementTable(
    doc,
    autoTable,
    [
      { item: data.profitAndLoss.revenue },
      { item: data.profitAndLoss.cogs },
      { item: data.profitAndLoss.grossProfit, isSubtotal: true },
      { item: data.profitAndLoss.operatingExpenses },
      { item: data.profitAndLoss.operatingIncome, isSubtotal: true },
      { item: data.profitAndLoss.netIncome, isSummary: true },
    ],
    66,
    "Income Statement",
    clOpts,
    pnlHdrOpts
  );

  // ── Cash Flow page ─────────────────────────────────────────────────────
  doc.addPage("a4", "landscape");
  const cfHdrOpts: PDFReportOptions = {
    title: "Cash Flow Statement",
    companyName: data.companyName,
    scenarioName: data.scenarioName,
    currency,
    locale,
  };
  addPDFHeader(doc, cfHdrOpts);

  const endingCashItem: StatementLineItem = {
    name: "Ending Cash Position",
    values: data.cashFlow.endingCash,
  };

  renderStatementTable(
    doc,
    autoTable,
    [
      { item: data.cashFlow.operatingCashFlow },
      { item: data.cashFlow.investingCashFlow },
      { item: data.cashFlow.financingCashFlow },
      { item: data.cashFlow.netCashChange, isSubtotal: true },
      { item: endingCashItem, isSummary: true },
    ],
    66,
    "Cash Flow",
    clOpts,
    cfHdrOpts
  );

  // ── Balance Sheet page ─────────────────────────────────────────────────
  doc.addPage("a4", "landscape");
  const bsHdrOpts: PDFReportOptions = {
    title: "Balance Sheet",
    companyName: data.companyName,
    scenarioName: data.scenarioName,
    currency,
    locale,
  };
  addPDFHeader(doc, bsHdrOpts);

  renderStatementTable(
    doc,
    autoTable,
    [
      { item: data.balanceSheet.assets },
      { item: data.balanceSheet.liabilities },
      { item: data.balanceSheet.equity, isSummary: true },
    ],
    66,
    "Balance Sheet",
    clOpts,
    bsHdrOpts
  );

  addPDFFooter(doc);
  return doc;
}

/**
 * RPT-10: generic table PDF for report views that don't have a bespoke
 * statement generator (Budget vs Actuals, Metrics Explorer). Rows are already
 * formatted strings — the caller owns currency/locale formatting (engine never
 * formats), keeping this helper format-agnostic and reusable.
 */
export async function generateTablePDF(
  headers: string[],
  rows: string[][],
  opts: PDFReportOptions
): Promise<jsPDFType> {
  const { jsPDF, autoTable } = await loadJsPDF();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  addPDFHeader(doc, opts);

  autoTable(doc, {
    startY: 66,
    head: [headers],
    body: rows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 4, textColor: [71, 85, 105] },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      headers.map((_, i) => [i, i === 0 ? { halign: "left" as const } : { halign: "right" as const }])
    ),
    margin: { left: 20, right: 20 },
  });

  addPDFFooter(doc);
  return doc;
}

/**
 * Trigger a PDF download in the browser.
 */
export function downloadPDF(doc: jsPDFType, filename: string) {
  doc.save(`${filename}.pdf`);
}
