import { describe, it, expect } from "vitest";
import { getFinancialTools } from "../tools";
import { TOOL_NAME_ALIASES } from "../tool-aliases";
import { DISPLAY_TOOL_NAMES, INPUT_TOOL_NAMES, PLAN_TOOL_NAMES } from "../generative-ui";

const ALLOWED_PREFIXES = ["create_", "get_", "update_", "delete_"];
const WEB_TOOLS = new Set(["search_web", "read_webpage"]);
// View-control & read-only list tools (not gated) are an intentional family —
// they either change the user's UI view (e.g. active scenario) or list entities
// without mutating data, so they do not fit the CRUD verb prefixes (`list_*` is
// a read, not a CRUD verb). Allowlisted like WEB_TOOLS.
const CONTROL_TOOLS = new Set(["activate_scenario", "exit_scenario", "list_scenarios", "list_accounts"]);
// Write tools that legitimately use a domain verb instead of a CRUD prefix.
// `record_transaction` writes the actuals ledger (it is in WRITE_TOOLS / gated as
// a mutation) but "record" reads more naturally than "create" for booking an
// actual that occurred. Allowlisted so it isn't forced into a create_* rename.
const DOMAIN_VERB_WRITE_TOOLS = new Set(["record_transaction"]);
// flavor:"core" — always-on, domain-less primitives (e.g. calculate()). These
// tools are exempt from CRUD-prefix and family-set requirements because they are
// not domain CRUD operations. Any tool with flavor:"core" is allowed regardless
// of its name shape. The hook is wired in Workstream 2.
const isCoreFlavorTool = (t: { flavor?: string }) => t.flavor === "core";

describe("tool naming convention", () => {
  const tools = getFinancialTools();

  it("every tool follows the CRUD convention, is a known web tool, or is a registered generative-UI tool", () => {
    for (const t of tools) {
      // Generative-UI display (show_*) and input (request_*) tools are a distinct,
      // intentional family — they are allowed only if registered in their set, so a
      // stray show_*/request_* name still fails (guards correct registration).
      // Plan tools (propose_plan) are a separate family registered in PLAN_TOOL_NAMES.
      // Core tools (flavor:"core") are always-on domain-less primitives — exempt
      // from CRUD-prefix and family-set requirements (Workstream 2 hook).
      const isGenui = DISPLAY_TOOL_NAMES.has(t.name) || INPUT_TOOL_NAMES.has(t.name);
      const isPlan = PLAN_TOOL_NAMES.has(t.name);
      const ok =
        isGenui ||
        isPlan ||
        isCoreFlavorTool(t) ||
        WEB_TOOLS.has(t.name) ||
        CONTROL_TOOLS.has(t.name) ||
        DOMAIN_VERB_WRITE_TOOLS.has(t.name) ||
        ALLOWED_PREFIXES.some((p) => t.name.startsWith(p));
      expect(ok, `tool "${t.name}" violates the naming convention`).toBe(true);
    }
  });

  it("no retired name is still defined as a live tool", () => {
    const liveNames = new Set(tools.map((t) => t.name));
    for (const oldName of Object.keys(TOOL_NAME_ALIASES)) {
      expect(liveNames.has(oldName), `retired tool "${oldName}" is still defined`).toBe(false);
    }
  });

  it("the removed `search` tool is gone", () => {
    expect(tools.some((t) => t.name === "search")).toBe(false);
  });

  it("tool names are unique", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
