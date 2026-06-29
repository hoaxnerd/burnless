import { D, dRound2 } from "../decimal";
import type { Alert, Change, Severity } from "./types";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

function pricingAlert(c: Change): Alert | null {
  const last = c.path[c.path.length - 1];
  if (c.kind === "added" && c.path[0] === "plans" && c.path.length === 2) {
    return { changeType: "plan_added", summary: "New pricing plan added", severity: "info", after: c.after };
  }
  if (c.kind === "removed" && c.path[0] === "plans" && c.path.length === 2) {
    return { changeType: "plan_removed", summary: "Pricing plan removed", severity: "info", before: c.before };
  }
  if (c.kind === "modified" && last === "amount") {
    const before = num(c.before);
    const after = num(c.after);
    if (before !== null && after !== null && before > 0) {
      const pct = dRound2(D(after).minus(before).div(before).times(100));
      const up = after > before;
      const sev: Severity = Math.abs(pct) >= 10 ? "warning" : "info";
      return {
        changeType: up ? "price_increase" : "price_decrease",
        summary: `Plan price ${before} → ${after} (${up ? "+" : ""}${pct}%)`,
        severity: sev,
        before,
        after,
      };
    }
  }
  return null;
}

function socialAlert(c: Change): Alert | null {
  if (c.kind === "modified" && c.path[c.path.length - 1] === "followers") {
    const before = num(c.before);
    const after = num(c.after);
    if (before !== null && after !== null) {
      const delta = after - before;
      const up = delta >= 0;
      return {
        changeType: up ? "followers_up" : "followers_down",
        summary: `${up ? "+" : ""}${fmtInt(delta)} followers (${fmtInt(before)} → ${fmtInt(after)})`,
        severity: "info",
        before,
        after,
      };
    }
  }
  return null;
}

function genericAlert(c: Change): Alert {
  return {
    changeType: "field_changed",
    summary: `${c.kind} at ${c.path.join(".") || "(root)"}`,
    severity: "info",
    before: c.before,
    after: c.after,
  };
}

export function evaluateRules(type: string, changes: Change[]): Alert[] {
  const specific = type === "pricing" ? pricingAlert : type === "social" ? socialAlert : null;
  return changes.map((c) => (specific && specific(c)) ?? genericAlert(c));
}
