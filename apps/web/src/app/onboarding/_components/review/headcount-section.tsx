import { Users } from "lucide-react";
import type { HeadcountRole } from "../types";
import { SectionCard, SuggestionCard, MiniInput, MiniSelect, CurrencyInput } from "./primitives";
import type { SuggestionListApi } from "./use-suggestions";

const DEPARTMENT_OPTIONS = [
  { value: "Engineering", label: "Engineering" },
  { value: "Sales", label: "Sales" },
  { value: "Marketing", label: "Marketing" },
  { value: "Operations", label: "Operations" },
  { value: "General & Admin", label: "General & Admin" },
] as const;

const EMPLOYEE_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contractor", label: "Contractor" },
] as const;

interface Props {
  api: SuggestionListApi<HeadcountRole>;
  currencySymbol: string;
}

export function HeadcountSection({ api, currencySymbol }: Props) {
  if (api.items.length === 0) return null;
  return (
    <SectionCard icon={Users} title="Suggested Headcount Plan" delay={450}>
      <div className="space-y-4">
        <p className="text-xs text-surface-500 dark:text-surface-400">
          Configure headcount hire suggestions. Specify title, department, employee type, salary, and start date.
        </p>
        <div className="space-y-3">
          {api.items.map((item) => (
            <SuggestionCard
              key={item.id}
              selected={Boolean(item.selected)}
              onToggleSelected={(next) => api.updateField(item.id, "selected", next)}
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <MiniInput
                  value={item.title}
                  onChange={(v) => api.updateField(item.id, "title", v)}
                  placeholder="Role Title"
                  className="flex-1"
                />
                <div className="flex gap-2">
                  <MiniSelect
                    value={item.department}
                    onChange={(v) => api.updateField(item.id, "department", v)}
                    options={DEPARTMENT_OPTIONS}
                  />
                  <MiniSelect
                    value={item.employeeType}
                    onChange={(v) => api.updateField(item.id, "employeeType", v)}
                    options={EMPLOYEE_TYPE_OPTIONS}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <FieldRow label="Salary/yr:">
                  <CurrencyInput
                    symbol={currencySymbol}
                    value={item.salary}
                    onChange={(v) => api.updateField(item.id, "salary", v)}
                    className="flex-1"
                  />
                </FieldRow>
                <FieldRow label="Start Date:">
                  <MiniInput
                    type="date"
                    value={item.startDate}
                    onChange={(v) => api.updateField(item.id, "startDate", v)}
                    className="w-full"
                  />
                </FieldRow>
              </div>
            </SuggestionCard>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-1">
      <span className="text-xs text-surface-500 dark:text-surface-400 whitespace-nowrap">{label}</span>
      {children}
    </div>
  );
}
