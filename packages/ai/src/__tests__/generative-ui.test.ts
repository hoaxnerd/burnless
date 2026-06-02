import { describe, it, expect } from "vitest";
import {
  isInputTool,
  isDisplayTool,
  buildInputFormSpec,
  INPUT_TOOL_NAMES,
  DISPLAY_TOOL_NAMES,
} from "../generative-ui";
import { categorizeToolName } from "../permissions";

describe("generative-ui tool sets", () => {
  it("recognizes the generic input tool", () => {
    expect(isInputTool("request_input_form")).toBe(true);
    expect(isInputTool("create_scenario")).toBe(false);
    expect(INPUT_TOOL_NAMES.has("request_input_form")).toBe(true);
  });

  it("display/input tools all classify as read (no permission card)", () => {
    for (const name of [...DISPLAY_TOOL_NAMES, ...INPUT_TOOL_NAMES]) {
      expect(categorizeToolName(name)).toBe("read");
    }
  });

  it("builds a passthrough spec for request_input_form", () => {
    const spec = buildInputFormSpec("request_input_form", {
      title: "Add revenue stream",
      description: "Tell me about it",
      submitLabel: "Create",
      fields: [
        { name: "name", type: "text", label: "Name", required: true },
        { name: "mrr", type: "currency", label: "MRR", defaultValue: 5000 },
      ],
    });
    expect(spec.title).toBe("Add revenue stream");
    expect(spec.fields).toHaveLength(2);
    expect(spec.fields[1]).toMatchObject({ name: "mrr", type: "currency", defaultValue: 5000 });
  });

  it("drops malformed fields and coerces missing arrays", () => {
    const spec = buildInputFormSpec("request_input_form", { title: "X", fields: "nope" });
    expect(spec.title).toBe("X");
    expect(spec.fields).toEqual([]);
  });

  it("throws for an unknown input tool name", () => {
    expect(() => buildInputFormSpec("not_a_form", {})).toThrow(/unknown input tool/i);
  });
});

import type { StreamChunk } from "../types";

describe("StreamChunk input_request shape", () => {
  it("accepts an input_request chunk with a spec", () => {
    const chunk: StreamChunk = {
      type: "input_request",
      pauseId: "p1",
      spec: { title: "T", fields: [] },
    };
    expect(chunk.type).toBe("input_request");
    expect(chunk.spec?.title).toBe("T");
  });
});

import * as pkg from "../index";
describe("package exports", () => {
  it("re-exports the generative-ui surface", () => {
    expect(typeof pkg.isInputTool).toBe("function");
    expect(typeof pkg.isDisplayTool).toBe("function");
    expect(typeof pkg.buildInputFormSpec).toBe("function");
    expect(pkg.DISPLAY_TOOL_NAMES).toBeInstanceOf(Set);
    expect(pkg.INPUT_TOOL_NAMES).toBeInstanceOf(Set);
  });
});
