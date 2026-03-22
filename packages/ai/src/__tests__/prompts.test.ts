import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, buildSystemMessage } from "../prompts";

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
    expect(SYSTEM_PROMPT).toContain("suggest_cost_cuts");
    expect(SYSTEM_PROMPT).toContain("forecast_revenue");
    expect(SYSTEM_PROMPT).toContain("benchmark_metrics");
    expect(SYSTEM_PROMPT).toContain("model_dilution");
    expect(SYSTEM_PROMPT).toContain("generate_report_narrative");
    expect(SYSTEM_PROMPT).toContain("categorize_transactions");
  });
});

describe("buildSystemMessage", () => {
  it("prepends system prompt to financial context", () => {
    const result = buildSystemMessage("MRR: $10,000");
    expect(result).toContain(SYSTEM_PROMPT);
    expect(result).toContain("MRR: $10,000");
  });

  it("includes Current Financial Data header", () => {
    const result = buildSystemMessage("test");
    expect(result).toContain("Current Financial Data");
  });

  it("handles empty context", () => {
    const result = buildSystemMessage("");
    expect(result).toContain(SYSTEM_PROMPT);
    expect(result).toContain("Current Financial Data");
  });
});
