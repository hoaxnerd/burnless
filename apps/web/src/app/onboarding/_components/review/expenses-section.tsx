import { Building2 } from "lucide-react";
import type { OperatingExpense } from "../types";
import { SectionCard, SuggestionCard, MiniInput, MiniSelect, CurrencyInput } from "./primitives";
import type { SuggestionListApi } from "./use-suggestions";

const EXPENSE_CATEGORY_OPTIONS = [
  { value: "Cloud Infrastructure", label: "Cloud Infrastructure" },
  { value: "Marketing", label: "Marketing" },
  { value: "Office & Admin", label: "Office & Admin" },
  { value: "Software & Tools", label: "Software & Tools" },
] as const;

interface Props {
  api: SuggestionListApi<OperatingExpense>;
  currencySymbol: string;
}

export function ExpensesSection({ api, currencySymbol }: Props) {
  if (api.items.length === 0) return null;
  return (
    <SectionCard icon={Building2} title="Suggested Expenses" delay={500}>
      <div className="space-y-4">
        <p className="text-xs text-surface-500 dark:text-surface-400">
          Select and edit operating expenses. Choose whether costs are recurring or one-time.
        </p>
        <div className="space-y-3">
          {api.items.map((expense) => (
            <SuggestionCard
              key={expense.id}
              selected={Boolean(expense.selected)}
              onToggleSelected={(next) => api.updateField(expense.id, "selected", next)}
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <MiniInput
                  value={expense.name}
                  onChange={(v) => api.updateField(expense.id, "name", v)}
                  placeholder="Expense vendor/name"
                  className="flex-1"
                />
                <MiniSelect
                  value={expense.category}
                  onChange={(v) => api.updateField(expense.id, "category", v)}
                  options={EXPENSE_CATEGORY_OPTIONS}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <FieldRow label="Amount:">
                  <CurrencyInput
                    symbol={currencySymbol}
                    value={expense.amount}
                    onChange={(v) => api.updateField(expense.id, "amount", v)}
                    className="flex-1"
                  />
                </FieldRow>
                <FieldRow label="Start Date:">
                  <MiniInput
                    type="date"
                    value={expense.startDate}
                    onChange={(v) => api.updateField(expense.id, "startDate", v)}
                    className="w-full"
                  />
                </FieldRow>
                <div className="flex items-center gap-2 px-1">
                  <input
                    type="checkbox"
                    id={`recur-${expense.id}`}
                    checked={expense.isRecurring}
                    onChange={(e) => api.updateField(expense.id, "isRecurring", e.target.checked)}
                    className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                  />
                  <label
                    htmlFor={`recur-${expense.id}`}
                    className="text-xs text-surface-600 dark:text-surface-400 whitespace-nowrap cursor-pointer"
                  >
                    Recurring
                  </label>
                </div>
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
