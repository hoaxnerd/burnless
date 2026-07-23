"use client";

/**
 * SWR hooks for the competitor-analysis domain.
 *
 * Live-update mechanics mirror useTransactions (WS2 lesson): both hooks
 * subscribe to the mutation bus and call mutate() when a competitor-domain
 * event fires (same-tab AND cross-tab). The competitor domain is kept separate
 * from FINANCIAL_DOMAINS so competitor syncs do NOT reset the AI-insight stale
 * countdown — only the SWR client cache is refreshed.
 */

import { useEffect } from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { KEYS } from "./keys";
import { subscribeMutation, COMPETITOR_DOMAINS } from "@/lib/mutation-bus";

// ── DTO types (JSON-safe: Date → ISO string) ─────────────────────────────────

/** A competitor row as returned by GET /api/competitors (JSON: Date → ISO string). */
export interface CompetitorDto {
  id: string;
  companyId: string;
  name: string;
  url: string;
  /** "active" | "paused" */
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** A competitor change row as returned by GET /api/competitors/[id]/changes. */
export interface CompetitorChangeDto {
  id: string;
  competitorId: string;
  sourceId: string;
  snapshotId: string;
  companyId: string;
  detectedAt: string;
  changeType: string;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** "info" | "warning" | "critical" */
  severity: string;
  acknowledgedAt: string | null;
  createdAt: string;
}

/** Payload shape returned by GET /api/competitors. */
export interface CompetitorsPayload {
  competitors: CompetitorDto[];
}

/** Payload shape returned by GET /api/competitors/[id]/changes. */
export interface CompetitorChangesPayload {
  changes: CompetitorChangeDto[];
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * All competitors for the current company.
 *
 * Live-updates after add/delete/sync via the competitor mutation bus — any
 * successful POST/PATCH/DELETE to /api/competitors* triggers a refetch here
 * (same-tab AND cross-tab), mirroring the useTransactions pattern from WS2.
 */
export function useCompetitors(
  config?: SWRConfiguration<CompetitorsPayload>,
) {
  const swr = useSWR<CompetitorsPayload>(KEYS.competitors, { ...config });
  const { mutate } = swr;
  useEffect(() => {
    return subscribeMutation((e) => {
      if (COMPETITOR_DOMAINS.has(e.domain)) mutate();
    });
  }, [mutate]);
  return swr;
}

/**
 * Detected changes for a single competitor, newest-first.
 *
 * Pass `competitorId` to enable the fetch; omit (or pass undefined/null) to
 * suspend fetching (SWR null-key pattern). Live-updates on competitor-domain
 * mutations so the changes list refreshes after a sync completes.
 */
export function useCompetitorChanges(
  competitorId?: string | null,
  config?: SWRConfiguration<CompetitorChangesPayload>,
) {
  const key = competitorId ? KEYS.competitorChanges(competitorId) : null;
  const swr = useSWR<CompetitorChangesPayload>(key, { ...config });
  const { mutate } = swr;
  useEffect(() => {
    if (!competitorId) return;
    return subscribeMutation((e) => {
      if (COMPETITOR_DOMAINS.has(e.domain)) mutate();
    });
  }, [competitorId, mutate]);
  return swr;
}
