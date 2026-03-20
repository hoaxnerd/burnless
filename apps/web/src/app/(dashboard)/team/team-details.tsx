"use client";

interface TeamMember {
  id: string;
  title: string;
  count: number;
  salary: number;
  benefitsRate: number;
  startDate: string;
}

interface DepartmentGroup {
  department: string;
  headcount: number;
  monthlyCost: number;
  members: TeamMember[];
}

interface PlannedHire {
  id: string;
  title: string;
  department: string;
  salary: number;
  benefitsRate: number;
  startDate: string;
  count: number;
}

interface TeamDetailsProps {
  departmentBreakdown: DepartmentGroup[];
  plannedHires: PlannedHire[];
  totalMonthlyCost: number;
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export function TeamDetails({
  departmentBreakdown,
  plannedHires,
  totalMonthlyCost,
}: TeamDetailsProps) {
  if (departmentBreakdown.length === 0 && plannedHires.length === 0) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <div className="mx-auto max-w-md">
          <div className="text-4xl mb-4">👥</div>
          <h3 className="text-lg font-semibold text-surface-900 mb-2">No team members yet</h3>
          <p className="text-sm text-surface-500 mb-6">
            Add your current team and planned hires to see how headcount affects your burn rate and runway.
          </p>
          <p className="text-xs text-surface-400">
            Use the AI companion or API: <code className="text-brand-600">POST /api/headcount</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Team by Department */}
      <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-lg font-semibold text-surface-900">Current Team</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Role</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Department</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Count</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Annual Salary</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Total Monthly</th>
            </tr>
          </thead>
          <tbody>
            {departmentBreakdown.map((dept) => (
              <>
                {/* Department header */}
                <tr key={`dept-${dept.department}`} className="bg-surface-50/50">
                  <td colSpan={3} className="px-6 py-2">
                    <span className="text-xs font-semibold text-surface-700 uppercase tracking-wide">
                      {dept.department} ({dept.headcount})
                    </span>
                  </td>
                  <td className="px-6 py-2 text-right">
                    <span className="text-xs font-medium text-surface-500">{formatCurrency(dept.monthlyCost)}/mo</span>
                  </td>
                  <td className="px-6 py-2 text-right">
                    <span className="text-xs text-surface-400">
                      {totalMonthlyCost > 0 ? `${(dept.monthlyCost / totalMonthlyCost * 100).toFixed(0)}%` : ""}
                    </span>
                  </td>
                </tr>
                {/* Members */}
                {dept.members.map((member) => {
                  const totalCost = (member.salary * member.count * (1 + member.benefitsRate)) / 12;
                  return (
                    <tr key={member.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 pl-10">
                        <span className="text-sm text-surface-900">{member.title}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-sm text-surface-500">{dept.department}</span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="text-sm text-surface-600">{member.count}</span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="text-sm text-surface-600">{formatCurrency(member.salary)}</span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="text-sm font-medium text-surface-900">{formatCurrency(totalCost)}</span>
                      </td>
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Planned Hires */}
      {plannedHires.length > 0 && (
        <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-lg font-semibold text-surface-900">Planned Hires</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Role</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Department</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Salary</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Monthly Impact</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Start Date</th>
              </tr>
            </thead>
            <tbody>
              {plannedHires.map((hire) => {
                const monthlyImpact = (hire.salary * hire.count * (1 + hire.benefitsRate)) / 12;
                return (
                  <tr key={hire.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                        <span className="text-sm font-medium text-surface-900">{hire.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-sm text-surface-600">{hire.department}</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-sm text-surface-600">{formatCurrency(hire.salary)}</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-sm font-medium text-red-600">+{formatCurrency(monthlyImpact)}/mo</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-sm text-surface-500">
                        {new Date(hire.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Headcount Impact */}
      {plannedHires.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">💡</span>
            <div>
              <p className="text-sm font-medium text-surface-900">Hiring Impact</p>
              <p className="text-xs text-surface-600 mt-0.5">
                {plannedHires.length} planned hire{plannedHires.length !== 1 ? "s" : ""} will add{" "}
                {formatCurrency(plannedHires.reduce(
                  (sum, h) => sum + (h.salary * h.count * (1 + h.benefitsRate)) / 12,
                  0
                ))}/mo to your burn rate.
                Ask the AI companion to model the impact on runway and suggest optimal hiring timing.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
