import type { GrantMatchWarning } from "@burnless/engine";

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
