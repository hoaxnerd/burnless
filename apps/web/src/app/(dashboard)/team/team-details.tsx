"use client";

import { useState, useMemo } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { Users, Calendar, TrendingUp, ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { AiGate } from "@/components/ai/ai-gate";
import { useOptionalAiFlags } from "@/components/ai/ai-feature-context";
import { useToast } from "@/components/ui/toast";
import { toUserMessage } from "@/lib/api-error";
import { pctOfTotal } from "@burnless/engine";
import { formatCurrency } from "@burnless/types";
import type { CurrencyCode } from "@burnless/types";
import { HeadcountForm, type EditableHeadcount } from "./headcount-form";
import { SalaryChangesList, type SalaryChange } from "./salary-changes-list";
import { BonusesList, type Bonus } from "./bonuses-list";
import { EquityGrantsList, type EquityGrant } from "./equity-grants-list";
import type { BenefitsBreakdown } from "@/lib/headcount-params";
import { OverrideIndicator } from "@/components/scenarios/override-indicator";
import { HiddenEntitiesSection } from "@/components/scenarios/hidden-entities-section";
import { useScenarioOverrides } from "@/components/scenarios/use-scenario-overrides";

interface Department {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  departmentId: string;
  title: string;
  name?: string | null;
  employeeType?: "full_time" | "part_time" | "contractor";
  count: number;
  salary: number;
  hourlyRate?: number | null;
  hoursPerWeek?: number | null;
  benefitsRate: number;
  startDate: string;
  endDate?: string | null;
  parameters?: { benefitsBreakdown?: BenefitsBreakdown } | null;
  salaryChanges: SalaryChange[];
  bonuses: Bonus[];
  equityGrants: EquityGrant[];
}

interface DepartmentGroup {
  department: string;
  headcount: number;
  monthlyCost: number;
  members: TeamMember[];
}

interface PlannedHire {
  id: string;
  departmentId: string;
  title: string;
  name?: string | null;
  employeeType?: "full_time" | "part_time" | "contractor";
  department: string;
  salary: number;
  hourlyRate?: number | null;
  hoursPerWeek?: number | null;
  benefitsRate: number;
  startDate: string;
  endDate?: string | null;
  count: number;
  parameters?: { benefitsBreakdown?: BenefitsBreakdown } | null;
  salaryChanges: SalaryChange[];
  bonuses: Bonus[];
  equityGrants: EquityGrant[];
}

const deptColors = [
  { bar: "bg-brand-500", dot: "bg-brand-500", text: "text-brand-600" },
  { bar: "bg-violet-500", dot: "bg-violet-500", text: "text-violet-600" },
  { bar: "bg-sky-500", dot: "bg-sky-500", text: "text-sky-600" },
  { bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-600" },
  { bar: "bg-amber-500", dot: "bg-amber-500", text: "text-amber-600" },
  { bar: "bg-rose-500", dot: "bg-rose-500", text: "text-rose-600" },
];

// ─── TeamRoster ──────────────────────────────────────────────────────────────

interface TeamRosterProps {
  departmentBreakdown: DepartmentGroup[];
  totalMonthlyCost: number;
  departments: Department[];
  companyBenefitsRates: BenefitsBreakdown;
  currency: CurrencyCode;
}

export function TeamRoster({
  departmentBreakdown,
  totalMonthlyCost,
  departments,
  companyBenefitsRates,
  currency,
}: TeamRosterProps) {
  const router = useRouter();
  const toast = useToast();
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [editingHire, setEditingHire] = useState<EditableHeadcount | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const {
    isInScenarioMode,
    overrideMap,
    deletedEntities,
    handleRevert,
    handleRemove,
    handleRestore,
  } = useScenarioOverrides("headcount_plan");

  const maxDeptCost = useMemo(
    () => Math.max(...departmentBreakdown.map((d) => d.monthlyCost), 1),
    [departmentBreakdown],
  );

  function toggleDept(dept: string) {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  }

  function openEditModal(member: TeamMember) {
    setEditingHire({
      id: member.id,
      departmentId: member.departmentId,
      title: member.title,
      name: member.name ?? null,
      employeeType: member.employeeType ?? "full_time",
      count: member.count,
      salary: member.salary,
      hourlyRate: member.hourlyRate ?? null,
      hoursPerWeek: member.hoursPerWeek ?? null,
      startDate: member.startDate,
      endDate: member.endDate,
      benefitsRate: member.benefitsRate,
      parameters: member.parameters ?? null,
    });
  }

  async function handleInlineDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/headcount/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete");
      }
      router.refresh();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  if (departmentBreakdown.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-16 text-center">
        <div className="mx-auto max-w-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 border border-brand-100">
            <Users className="h-7 w-7 text-brand-500" />
          </div>
          <h3 className="text-lg font-semibold text-surface-900 mb-2">No team members yet</h3>
          <p className="text-sm text-surface-500 mb-6 leading-relaxed">
            Add your current team to see how headcount affects your burn rate and runway.
          </p>
          <p className="text-xs text-surface-400">
            Use the &quot;Add Team Member&quot; button above to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Edit modal */}
      {editingHire && (
        <HeadcountForm
          departments={departments}
          companyBenefitsRates={companyBenefitsRates}
          edit={editingHire}
          open={!!editingHire}
          onClose={() => setEditingHire(null)}
        />
      )}

      {/* Department Cost Distribution */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-100">
          <h2 className="text-base font-semibold text-surface-900">Cost by Department</h2>
          <p className="text-xs text-surface-400 mt-0.5">Monthly people cost distribution</p>
        </div>
        <div className="p-6 space-y-4">
          {departmentBreakdown
            .sort((a, b) => b.monthlyCost - a.monthlyCost)
            .map((dept, i) => {
              const color = deptColors[i % deptColors.length]!;
              const pct = pctOfTotal(dept.monthlyCost, totalMonthlyCost);
              const barWidth = (dept.monthlyCost / maxDeptCost) * 100;
              const isExpanded = expandedDepts.has(dept.department);

              return (
                <div key={dept.department}>
                  <button
                    onClick={() => toggleDept(dept.department)}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-surface-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-surface-400" />
                        )}
                        <span className="text-sm font-medium text-surface-900 group-hover:text-brand-600 transition-colors">
                          {dept.department}
                        </span>
                        <span className="text-xs text-surface-400">
                          {dept.headcount} {dept.headcount === 1 ? "person" : "people"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs tabular-nums text-surface-500">
                          {pct.toFixed(0)}%
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-surface-900">
                          {formatCurrency(dept.monthlyCost, currency, undefined, { compact: true })}
                          <span className="text-xs font-normal text-surface-400">/mo</span>
                        </span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color.bar} transition-all duration-500`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </button>

                  {/* Expanded member list */}
                  {isExpanded && (
                    <div className="mt-3 ml-5 space-y-1.5 animate-fade-in">
                      {dept.members.map((member) => {
                        const monthlyCost =
                          (member.salary * member.count * (1 + member.benefitsRate)) / 12;
                        const memberOverride = isInScenarioMode ? overrideMap.get(member.id) : undefined;
                        const memberOverrideTag = memberOverride?.action === "modify" ? "modified" as const : memberOverride?.action === "create" ? "created" as const : null;

                        const isDetailsOpen = detailsId === member.id;
                        return (
                          <OverrideIndicator
                            key={member.id}
                            override={memberOverrideTag}
                            entityName={member.title}
                            onRevert={() => handleRevert(member.id)}
                            onRemove={() => handleRemove(member.id)}
                          >
                            <div className="rounded-lg hover:bg-surface-50 transition-colors group/row">
                              <div className="flex items-center justify-between py-2 px-3">
                                <button
                                  type="button"
                                  onClick={() => setDetailsId((cur) => (cur === member.id ? null : member.id))}
                                  className="flex items-center gap-2.5 text-left"
                                  title={isDetailsOpen ? "Collapse details" : "Expand details (compensation history)"}
                                >
                                  <div className={`h-2 w-2 rounded-full ${color.dot}`} />
                                  <span className="text-sm text-surface-700">{member.title}</span>
                                  {member.count > 1 && (
                                    <span className="text-xs text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded">
                                      ×{member.count}
                                    </span>
                                  )}
                                </button>
                                <div className="flex items-center gap-4 text-right">
                                  <span className="text-xs tabular-nums text-surface-400">
                                    {formatCurrency(member.salary, currency, undefined, { compact: true })}/yr
                                  </span>
                                  <span className="text-sm tabular-nums font-medium text-surface-700">
                                    {formatCurrency(monthlyCost, currency, undefined, { compact: true })}/mo
                                  </span>
                                  <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); openEditModal(member); }}
                                      className="rounded-md p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                      title="Edit team member"
                                      aria-label={`Edit team member — ${member.title}${member.name ? ` (${member.name})` : ""}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleInlineDelete(member.id); }}
                                      disabled={deletingId === member.id}
                                      className={`rounded-md p-1.5 transition-colors disabled:opacity-50 ${
                                        confirmDeleteId === member.id
                                          ? "text-white bg-danger-600 hover:bg-danger-700"
                                          : "text-surface-400 hover:text-danger-600 hover:bg-danger-50"
                                      }`}
                                      title={
                                        confirmDeleteId === member.id
                                          ? "Click again to confirm"
                                          : memberOverrideTag
                                            ? "Delete (creates a scenario delete override)"
                                            : "Delete team member"
                                      }
                                      aria-label={`Delete team member — ${member.title}${member.name ? ` (${member.name})` : ""}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                              {isDetailsOpen && (
                                <div className="px-3 pb-3 space-y-3 border-t border-surface-100 pt-3 mt-1">
                                  <SalaryChangesList
                                    headcountId={member.id}
                                    changes={member.salaryChanges}
                                  />
                                  <BonusesList
                                    headcountId={member.id}
                                    bonuses={member.bonuses}
                                  />
                                  <EquityGrantsList
                                    headcountId={member.id}
                                    grants={member.equityGrants}
                                  />
                                </div>
                              )}
                            </div>
                          </OverrideIndicator>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Hidden in scenario section */}
      {isInScenarioMode && (
        <HiddenEntitiesSection
          deletedEntities={deletedEntities}
          entityLabel="team member"
          onRestore={handleRestore}
        />
      )}
    </div>
  );
}

// ─── PlannedHiresSection ─────────────────────────────────────────────────────

interface PlannedHiresSectionProps {
  plannedHires: PlannedHire[];
  departments: Department[];
  companyBenefitsRates: BenefitsBreakdown;
  currency: CurrencyCode;
}

export function PlannedHiresSection({
  plannedHires,
  departments,
  companyBenefitsRates,
  currency,
}: PlannedHiresSectionProps) {
  const router = useRouter();
  const toast = useToast();
  const [editingHire, setEditingHire] = useState<EditableHeadcount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const {
    isInScenarioMode,
    overrideMap,
    handleRevert,
    handleRemove,
  } = useScenarioOverrides("headcount_plan");

  // Group planned hires by quarter
  const hiringTimeline = useMemo(() => {
    const quarters = new Map<string, { hires: PlannedHire[]; totalMonthlyImpact: number }>();
    for (const hire of plannedHires) {
      const d = new Date(hire.startDate);
      const q = `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
      if (!quarters.has(q)) quarters.set(q, { hires: [], totalMonthlyImpact: 0 });
      const entry = quarters.get(q)!;
      entry.hires.push(hire);
      entry.totalMonthlyImpact += (hire.salary * hire.count * (1 + hire.benefitsRate)) / 12;
    }
    return Array.from(quarters.entries()).map(([quarter, data]) => ({
      quarter,
      ...data,
    }));
  }, [plannedHires]);

  function openEditModalFromHire(hire: PlannedHire) {
    setEditingHire({
      id: hire.id,
      departmentId: hire.departmentId,
      title: hire.title,
      name: hire.name ?? null,
      employeeType: hire.employeeType ?? "full_time",
      count: hire.count,
      salary: hire.salary,
      hourlyRate: hire.hourlyRate ?? null,
      hoursPerWeek: hire.hoursPerWeek ?? null,
      startDate: hire.startDate,
      endDate: hire.endDate,
      benefitsRate: hire.benefitsRate,
      parameters: hire.parameters ?? null,
    });
  }

  async function handleInlineDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/headcount/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete");
      }
      router.refresh();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  if (plannedHires.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-10 text-center">
        <div className="mx-auto max-w-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 border border-amber-100">
            <Calendar className="h-6 w-6 text-amber-500" />
          </div>
          <h3 className="text-base font-semibold text-surface-900 mb-2">No planned hires yet</h3>
          <p className="text-sm text-surface-500 leading-relaxed">
            Use the Add Hire button above to plan future team growth.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Edit modal */}
      {editingHire && (
        <HeadcountForm
          departments={departments}
          companyBenefitsRates={companyBenefitsRates}
          edit={editingHire}
          open={!!editingHire}
          onClose={() => setEditingHire(null)}
        />
      )}

      {/* Hiring Timeline */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-100">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-surface-400" />
            <h2 className="text-base font-semibold text-surface-900">Hiring Timeline</h2>
          </div>
          <p className="text-xs text-surface-400 mt-0.5">
            Planned hires by quarter with cumulative burn impact
          </p>
        </div>

        <div className="p-6">
          {/* Cumulative impact bar */}
          <div className="mb-6 rounded-xl bg-surface-50 border border-surface-100 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-danger-500" />
                <span className="text-sm font-medium text-surface-700">Total Hiring Impact</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-danger-600">
                +{formatCurrency(
                  plannedHires.reduce(
                    (sum, h) => sum + (h.salary * h.count * (1 + h.benefitsRate)) / 12,
                    0,
                  ),
                  currency, undefined, { compact: true }
                )}
                /mo
              </span>
            </div>
            <p className="text-xs text-surface-400 mt-1">
              {plannedHires.reduce((s, h) => s + h.count, 0)} new{" "}
              {plannedHires.reduce((s, h) => s + h.count, 0) === 1 ? "hire" : "hires"} across{" "}
              {hiringTimeline.length} {hiringTimeline.length === 1 ? "quarter" : "quarters"}
            </p>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-surface-200" />

            <div className="space-y-6">
              {hiringTimeline.map((q, _qi) => (
                <div key={q.quarter} className="relative pl-10">
                  {/* Timeline dot */}
                  <div className="absolute left-2 top-1 h-3.5 w-3.5 rounded-full border-2 border-brand-500 bg-surface-0" />

                  <div className="rounded-xl border border-surface-100 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-surface-50">
                      <span className="text-sm font-semibold text-surface-900">{q.quarter}</span>
                      <span className="text-xs tabular-nums font-medium text-danger-600">
                        +{formatCurrency(q.totalMonthlyImpact, currency, undefined, { compact: true })}/mo
                      </span>
                    </div>
                    <div className="divide-y divide-surface-100">
                      {q.hires.map((hire) => {
                        const impact =
                          (hire.salary * hire.count * (1 + hire.benefitsRate)) / 12;
                        const hireOverride = isInScenarioMode ? overrideMap.get(hire.id) : undefined;
                        const hireOverrideTag = hireOverride?.action === "modify" ? "modified" as const : hireOverride?.action === "create" ? "created" as const : null;

                        return (
                          <OverrideIndicator
                            key={hire.id}
                            override={hireOverrideTag}
                            entityName={hire.title}
                            onRevert={() => handleRevert(hire.id)}
                            onRemove={() => handleRemove(hire.id)}
                          >
                            <div
                              className="flex items-center justify-between px-4 py-2.5 group/hire"
                            >
                              <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                <span className="text-sm text-surface-700">{hire.title}</span>
                                <span className="text-xs text-surface-400">{hire.department}</span>
                                {hire.count > 1 && (
                                  <span className="text-xs text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded">
                                    ×{hire.count}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-xs tabular-nums text-surface-400">
                                  {formatCurrency(hire.salary, currency, undefined, { compact: true })}/yr
                                </span>
                                <span className="text-sm tabular-nums font-medium text-surface-700">
                                  +{formatCurrency(impact, currency, undefined, { compact: true })}/mo
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover/hire:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditModalFromHire(hire); }}
                                    className="rounded-md p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                    title="Edit planned hire"
                                    aria-label={`Edit planned hire — ${hire.title}${hire.name ? ` (${hire.name})` : ""}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleInlineDelete(hire.id); }}
                                    disabled={deletingId === hire.id}
                                    className={`rounded-md p-1.5 transition-colors disabled:opacity-50 ${
                                      confirmDeleteId === hire.id
                                        ? "text-white bg-danger-600 hover:bg-danger-700"
                                        : "text-surface-400 hover:text-danger-600 hover:bg-danger-50"
                                    }`}
                                    title={
                                      confirmDeleteId === hire.id
                                        ? "Click again to confirm"
                                        : hireOverrideTag
                                          ? "Delete (creates a scenario delete override)"
                                          : "Delete planned hire"
                                    }
                                    aria-label={`Delete planned hire — ${hire.title}${hire.name ? ` (${hire.name})` : ""}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </OverrideIndicator>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HiringInsightTip ────────────────────────────────────────────────────────

interface HiringInsightTipProps {
  plannedHires: Array<{ salary: number; count: number; benefitsRate: number }>;
  currency: CurrencyCode;
}

export function HiringInsightTip({ plannedHires, currency }: HiringInsightTipProps) {
  const aiFlags = useOptionalAiFlags();
  const companionName = aiFlags?.companionName ?? "companion";
  const totalMonthlyImpact = plannedHires.reduce(
    (sum, h) => sum + (h.salary * h.count * (1 + h.benefitsRate)) / 12,
    0,
  );

  return (
    <AiGate feature="insights" hideWhenOff>
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-brand-50/30 p-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
          <TrendingUp className="h-4 w-4 text-brand-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-surface-900">Hiring Impact Analysis</p>
          <p className="text-xs text-surface-600 mt-1 leading-relaxed">
            {plannedHires.length} planned hire{plannedHires.length !== 1 ? "s" : ""} will add{" "}
            <span className="font-semibold tabular-nums">
              {formatCurrency(totalMonthlyImpact, currency, undefined, { compact: true })}
              /mo
            </span>{" "}
            to your burn rate. Ask the {companionName} to model the impact on runway
            and suggest optimal hiring timing.
          </p>
        </div>
      </div>
    </div>
    </AiGate>
  );
}
