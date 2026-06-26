/**
 * Integrations domain module — context-only (C3.3).
 *
 * Its ONLY surface is a ContextContributor that tells the AI which external data
 * sources are connected (and how fresh they are), so the assistant knows what's
 * available without guessing. NO tools, NO prompt sections, NO nav.
 *
 * core: true → always-on and edition-agnostic. It naturally adds nothing when no
 * integration is connected (sections() returns [] for zero active integrations),
 * so being core costs nothing for companies without integrations.
 *
 * Graceful degradation: any DB error or zero active integrations → [] so the
 * contributor never breaks the AI turn (mirrors company-knowledge / finance).
 */

import { db, integrations, transactions } from "@burnless/db";
import { and, count, eq } from "drizzle-orm";
import type { ContextContributor, ContextSection, ContributeCtx } from "@burnless/ai";
import type { DomainModule } from "./contracts";

// ── Display labels for known integration types ───────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  stripe: "Stripe",
  quickbooks: "QuickBooks",
  xero: "Xero",
  freshbooks: "FreshBooks",
  plaid: "Plaid",
  mercury: "Mercury",
  gusto: "Gusto",
};

/** Title-case fallback for any type not in TYPE_LABELS. */
function labelFor(type: string): string {
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Small inline relative-time formatter (this is TIME, not money — no currency,
 * no locale formatter needed). Returns e.g. "just now", "2 hours ago", "never".
 */
function relativeTime(when: Date | null | undefined): string {
  if (!when) return "never";
  const ts = when instanceof Date ? when.getTime() : new Date(when).getTime();
  if (Number.isNaN(ts)) return "never";

  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "just now";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;

  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

/** Group separators only — no currency symbol, no locale-specific assumptions. */
function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

// ── Integrations context contributor ─────────────────────────────────────────

export const integrationsContributor: ContextContributor = {
  id: "integrations-sources",
  domain: "integrations",
  async sections(ctx: ContributeCtx): Promise<ContextSection[]> {
    try {
      const active = (await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.companyId, ctx.companyId),
            eq(integrations.status, "active"),
          ),
        )) as Array<{ type: string; lastSyncAt: Date | null }>;

      if (active.length === 0) return [];

      // Total integration-sourced transactions for this company (single total is
      // sufficient for v1; never block the turn if the count read fails).
      let txCount = 0;
      try {
        const rows = (await db
          .select({ value: count() })
          .from(transactions)
          .where(
            and(
              eq(transactions.companyId, ctx.companyId),
              eq(transactions.source, "integration"),
            ),
          )) as Array<{ value: number }>;
        txCount = Number(rows[0]?.value ?? 0);
      } catch {
        txCount = 0;
      }

      const bullets = active
        .map((row) => {
          const label = labelFor(row.type);
          const synced = relativeTime(row.lastSyncAt);
          return `- ${label} — last synced ${synced}, ${formatCount(txCount)} transactions`;
        })
        .join("\n");

      return [
        {
          heading: "Connected data sources",
          body: bullets,
        },
      ];
    } catch {
      // Graceful degradation: never throw out of a contributor.
      return [];
    }
  },
};

// ── Integrations domain module ───────────────────────────────────────────────

export const integrationsDomainModule: DomainModule = {
  id: "integrations",
  core: true,
  tools: [],
  handlers: {},
  contextContributors: [integrationsContributor],
  promptSections: [],
  navEntries: [],
};
