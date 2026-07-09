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

const MAX_ALERTS_PER_RUN = 25;

function feedAlert(c: Change): Alert | null {
  if (c.kind === "added" && c.path[0] === "items" && c.path.length === 2) {
    const after = c.after as { title?: string } | undefined;
    return {
      changeType: "post_published",
      summary: `New post: ${after?.title ?? "(untitled)"}`,
      severity: "info",
      after: c.after,
    };
  }
  return null; // removed items (windowed feed) + nested mods → dropped
}

function sitemapAlert(c: Change): Alert | null {
  if (c.path[0] === "urls" && c.path.length === 2) {
    const url = c.path[1];
    if (c.kind === "added") {
      return { changeType: "page_added", summary: `Page added: ${url}`, severity: "info", after: c.after };
    }
    if (c.kind === "removed") {
      return { changeType: "page_removed", summary: `Page removed: ${url}`, severity: "info", before: c.before };
    }
  }
  return null; // count modification + truncated marker → dropped
}

function dropNull(changes: Change[], rule: (c: Change) => Alert | null): Alert[] {
  const out: Alert[] = [];
  for (const c of changes) {
    const a = rule(c);
    if (a !== null) out.push(a);
  }
  return out;
}

/** Anti-flood: keep ≤25 individual alerts per changeType, collapse the rest into
 *  one summary alert for that type. Order-stable. */
function capAlerts(alerts: Alert[]): Alert[] {
  const kept: Alert[] = [];
  const seen = new Map<string, number>();
  const overflow = new Map<string, number>();
  for (const a of alerts) {
    const n = (seen.get(a.changeType) ?? 0) + 1;
    seen.set(a.changeType, n);
    if (n <= MAX_ALERTS_PER_RUN) kept.push(a);
    else overflow.set(a.changeType, (overflow.get(a.changeType) ?? 0) + 1);
  }
  for (const [changeType, n] of overflow) {
    const noun =
      changeType === "page_added"
        ? "pages added"
        : changeType === "page_removed"
          ? "pages removed"
          : changeType === "post_published"
            ? "posts published"
            : "changes";
    kept.push({ changeType, summary: `+${n} ${noun}`, severity: "info" });
  }
  return kept;
}

export function evaluateRules(type: string, changes: Change[]): Alert[] {
  if (type === "feed") return capAlerts(dropNull(changes, feedAlert));
  if (type === "sitemap") return capAlerts(dropNull(changes, sitemapAlert));
  const specific = type === "pricing" ? pricingAlert : type === "social" ? socialAlert : null;
  return changes.map((c) => (specific && specific(c)) ?? genericAlert(c));
}
