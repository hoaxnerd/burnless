import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, buildSystemPrompt, buildSystemMessage } from "../prompts";

describe("SYSTEM_PROMPT", () => {
  it("identifies as Burnless AI", () => {
    expect(SYSTEM_PROMPT).toContain("Burnless AI");
  });

  it("includes financial expertise section", () => {
    expect(SYSTEM_PROMPT).toContain("SaaS metrics");
    expect(SYSTEM_PROMPT).toContain("MRR");
    expect(SYSTEM_PROMPT).toContain("burn rate");
    expect(SYSTEM_PROMPT).toContain("runway");
  });

  it("includes security instructions", () => {
    expect(SYSTEM_PROMPT).toContain("confidential");
    expect(SYSTEM_PROMPT).toContain("Do not reveal");
  });

  it("references available tools", () => {
    expect(SYSTEM_PROMPT).toContain("get_expense_analysis");
    expect(SYSTEM_PROMPT).toContain("get_revenue_projection");
    expect(SYSTEM_PROMPT).toContain("get_metric_benchmarks");
    expect(SYSTEM_PROMPT).toContain("get_dilution_projection");
    expect(SYSTEM_PROMPT).toContain("get_report_data");
    expect(SYSTEM_PROMPT).toContain("get_transaction_categories");
  });
});

describe("generative UI guidance", () => {
  it("instructs the model on display tools", () => {
    expect(SYSTEM_PROMPT).toContain("show_metric_card");
    expect(SYSTEM_PROMPT).toContain("show_line_chart");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("instead of describing numbers");
  });
  it("instructs the model on input forms", () => {
    expect(SYSTEM_PROMPT).toContain("request_input_form");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("propose");
  });
});

describe("buildSystemMessage", () => {
  it("prepends system prompt to financial context", () => {
    const result = buildSystemMessage("MRR: $10,000");
    expect(result).toContain(buildSystemPrompt());
    expect(result).toContain("MRR: $10,000");
  });

  it("includes Current Financial Data header", () => {
    const result = buildSystemMessage("test");
    expect(result).toContain("Current Financial Data");
  });

  it("handles empty context", () => {
    const result = buildSystemMessage("");
    expect(result).toContain(buildSystemPrompt());
    expect(result).toContain("Current Financial Data");
  });
});
