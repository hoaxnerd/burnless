import { ratioToPct, type CapTable, type GrantMatchWarning } from "@burnless/engine";

/**
 * H3 (Task 2.7): single-source founder ownership.
 *
 * `/funding` previously derived founder ownership from `Σ fundingRounds.dilutionPercent`
 * — a stored, hand-entered model that drifts from the reconciled engine cap table
 * (`computeCapTable`), so the `/funding` headline and `/funding/cap-table` could show
 * contradictory founder %s. This reads the SAME engine cap-table "Founders" row that
 * the cap-table page renders, converting its 0-1 fully-diluted `ownershipPercent` to a
 * 0-100 percent via the engine `ratioToPct` helper (no inline *100). Both surfaces now
 * share one source. Returns 0 when there is no Founders row (empty cap table).
 */
export function deriveFounderOwnershipFromCapTable(capTable: CapTable): number {
  const foundersRow = capTable.rows.find((r) => r.holder === "Founders");
  if (!foundersRow) return 0;
  return ratioToPct(foundersRow.ownershipPercent);
}

interface MilestoneShape {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  hitDate?: string;
  matchWarning?: { requiredAmount: number; actualAmount: number; asOf: string };
}

interface RoundShape {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
}

/**
 * Phase 2 D D5: bridge engine warnings (flat array, keyed by roundId+milestoneId)
 * onto the per-milestone UI prop shape expected by <MilestoneTracker>. Engine stays
 * pure; web layer owns the shape transformation.
 */
export function enrichGrantMilestonesWithWarnings<T extends RoundShape>(
  rounds: T[],
  warnings: GrantMatchWarning[],
): T[] {
  if (warnings.length === 0) return rounds;
  const byRoundMilestone = new Map<string, GrantMatchWarning>();
  for (const w of warnings) {
    byRoundMilestone.set(`${w.roundId}:${w.milestoneId}`, w);
  }
  return rounds.map((r) => {
    if (r.type !== "grant") return r;
    const milestones = ((r.parameters as { milestones?: MilestoneShape[] }).milestones ?? []).map((m) => {
      const w = byRoundMilestone.get(`${r.id}:${m.id}`);
      if (!w) return m;
      return {
        ...m,
        matchWarning: {
          requiredAmount: w.requiredAmount,
          actualAmount: w.actualAmount,
          asOf: w.asOf,
        },
      };
    });
    return { ...r, parameters: { ...r.parameters, milestones } };
  });
}
