import { describe, it, expect, vi } from "vitest";
import {
  render as rtlRender,
  screen,
  fireEvent,
  type RenderOptions,
} from "@testing-library/react";
import { type ReactElement } from "react";
import {
  BoardMeetingButton,
  BoardMeetingOverlay,
  type BoardMeetingData,
} from "../board-meeting-mode";
import { ToastProvider } from "@/components/ui/toast";
import { formatCompactAmount } from "@burnless/types";

// BoardMeetingOverlay now surfaces clipboard/PDF failures via useToast, which
// requires a ToastProvider in the tree.
function render(ui: ReactElement, options?: RenderOptions) {
  return rtlRender(<ToastProvider>{ui}</ToastProvider>, options);
}

// Mock keyboard shortcuts hook
vi.mock("@/components/ui/keyboard-shortcuts", () => ({
  usePageShortcuts: vi.fn(),
}));

// Mock locale context — provide USD compact formatter
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({
    fmtCompact: (v: number) => formatCompactAmount(v, "USD", "en-US"),
    fmtCurrency: (v: number) => formatCompactAmount(v, "USD", "en-US"),
    currency: "USD",
    locale: "en-US",
    loaded: true,
  }),
}));

const sampleData: BoardMeetingData = {
  companyName: "Acme Inc",
  monthLabel: "March 2026",
  cash: 750000,
  burn: 45000,
  runway: 16.7,
  mrr: 15000,
  mrrGrowth: 12.3,
  headcount: 8,
  headcountDelta: 2,
};

describe("BoardMeetingButton", () => {
  it("renders with title", () => {
    render(<BoardMeetingButton onClick={vi.fn()} />);
    const btn = screen.getByTitle("Board Meeting Mode (B)");
    expect(btn).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<BoardMeetingButton onClick={onClick} />);
    fireEvent.click(screen.getByTitle("Board Meeting Mode (B)"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows Board Mode text", () => {
    render(<BoardMeetingButton onClick={vi.fn()} />);
    expect(screen.getByText("Board Mode")).toBeInTheDocument();
  });
});

describe("BoardMeetingOverlay", () => {
  it("renders company name", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
  });

  it("renders month label", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    expect(screen.getByText(/March 2026/)).toBeInTheDocument();
  });

  it("renders all 6 metrics", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Burn")).toBeInTheDocument();
    expect(screen.getByText("Runway")).toBeInTheDocument();
    expect(screen.getByText("MRR")).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Headcount")).toBeInTheDocument();
  });

  it("renders formatted cash value", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    // formatCompactAmount(750000) → "$750k" (lowercase k from centralized formatter)
    expect(screen.getByText("$750k")).toBeInTheDocument();
  });

  it("renders runway value", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    // DASH-07: runway routes through the canonical formatMetricValue(_, "months"),
    // which rounds to whole months (16.7 → "17 mo") for parity with the hero card.
    expect(screen.getByText("17 mo")).toBeInTheDocument();
  });

  it("shows green signal for healthy runway (>12 months)", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    // Both Cash and Runway show "Healthy" with 16.7 months runway
    const healthyNotes = screen.getAllByText("Healthy");
    expect(healthyNotes.length).toBeGreaterThanOrEqual(2);
  });

  it("shows growth percentage", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    expect(screen.getByText("+12.3%")).toBeInTheDocument();
  });

  it("shows headcount delta note", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    expect(screen.getByText("+2 this month")).toBeInTheDocument();
  });

  it("renders Share as PDF button", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    expect(screen.getByText("Share as PDF")).toBeInTheDocument();
  });

  it("renders Copy to clipboard button", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    expect(screen.getByText("Copy to clipboard")).toBeInTheDocument();
  });

  it("renders keyboard shortcut hints", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    expect(screen.getByText("Esc")).toBeInTheDocument();
  });

  it("has dialog role with correct label", () => {
    render(<BoardMeetingOverlay data={sampleData} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<BoardMeetingOverlay data={sampleData} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("handles missing/NaN data gracefully", () => {
    const badData = {
      companyName: "",
      monthLabel: "",
      cash: NaN,
      burn: NaN,
      runway: NaN,
      mrr: NaN,
      mrrGrowth: NaN,
      headcount: NaN,
      headcountDelta: NaN,
    };
    // Should not throw — all NaN values fall back to 0 via isFinite checks
    render(<BoardMeetingOverlay data={badData} onClose={vi.fn()} />);
    // With all zeros: cash=0 => "Out of cash" (red signal)
    expect(screen.getByText("Out of cash")).toBeInTheDocument();
    // All 6 metrics should still render
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Headcount")).toBeInTheDocument();
  });

  it("shows red signal for low runway (< 6 months)", () => {
    const lowRunway = { ...sampleData, runway: 4, cash: 180000 };
    render(<BoardMeetingOverlay data={lowRunway} onClose={vi.fn()} />);
    expect(screen.getByText(/act now/i)).toBeInTheDocument();
  });

  it("shows amber signal for moderate runway (6-12 months)", () => {
    const medRunway = { ...sampleData, runway: 9, cash: 400000 };
    render(<BoardMeetingOverlay data={medRunway} onClose={vi.fn()} />);
    expect(screen.getByText("Under 12mo target")).toBeInTheDocument();
  });

  it("shows infinity symbol for infinite runway", () => {
    const infiniteRunway = { ...sampleData, runway: 9999, burn: -5000 };
    render(<BoardMeetingOverlay data={infiniteRunway} onClose={vi.fn()} />);
    expect(screen.getByText("\u221e")).toBeInTheDocument();
  });

  it("shows red signal for declining growth", () => {
    const declining = { ...sampleData, mrrGrowth: -5.2 };
    render(<BoardMeetingOverlay data={declining} onClose={vi.fn()} />);
    expect(screen.getByText("Declining")).toBeInTheDocument();
  });

  it("formats millions correctly", () => {
    const bigCash = { ...sampleData, cash: 5_200_000 };
    render(<BoardMeetingOverlay data={bigCash} onClose={vi.fn()} />);
    expect(screen.getByText("$5.2M")).toBeInTheDocument();
  });
});
