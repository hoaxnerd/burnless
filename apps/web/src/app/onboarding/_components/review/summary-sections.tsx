import { DollarSign, Users, AlertTriangle } from "lucide-react";
import type { CompanyFields } from "../types";
import { FIELD_LABELS, FIELD_PLACEHOLDERS } from "../constants";
import { SANE_MAX_AMOUNT, SANE_MAX_COUNT } from "@/lib/onboarding-helpers";
import { ConfidenceBadge } from "../confidence-badge";
import { SectionCard, InlineField } from "./primitives";

interface SummaryProps {
  fields: CompanyFields;
  onUpdateField: (name: keyof CompanyFields, value: string) => void;
  currencySymbol: string;
}

/**
 * ONB-02 — non-blocking display threshold for the soft-warning chip. The
 * server hard-max (SANE_MAX_AMOUNT) REJECTS; this only WARNS, well below the
 * hard max, so an absurd-but-not-impossible value (e.g. $9.8B monthly revenue)
 * is flagged for double-checking without ever blocking submit.
 */
const REVENUE_WARN_THRESHOLD = 1e9;

/** Parse the raw numeric string of an onboarding money/count field, NaN-safe. */
function numeric(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function WarningChip({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-warning-50 dark:bg-warning-950 px-2 py-1 text-xs font-medium text-warning-700 dark:text-warning-400"
    >
      <AlertTriangle className="w-3 h-3 shrink-0" />
      {message}
    </div>
  );
}

const LARGE_VALUE_WARNING = "This value looks unusually large — please double-check";

export function FinancialsSummarySection({ fields, onUpdateField, currencySymbol }: SummaryProps) {
  const revenueLarge = numeric(fields.monthly_revenue.value) > REVENUE_WARN_THRESHOLD;
  const fundingLarge = numeric(fields.funding.value) > REVENUE_WARN_THRESHOLD;
  return (
    <SectionCard icon={DollarSign} title="Financials Overview" delay={200}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <InlineField
            label="Monthly Revenue"
            field={fields.monthly_revenue}
            placeholder={FIELD_PLACEHOLDERS.monthly_revenue}
            onChange={(v) => onUpdateField("monthly_revenue", v)}
            badge={<ConfidenceBadge {...fields.monthly_revenue} />}
            type="number"
            min="0"
            max={String(SANE_MAX_AMOUNT)}
            step="1"
            prefix={currencySymbol}
          />
          {revenueLarge && <WarningChip message={LARGE_VALUE_WARNING} />}
        </div>
        <div>
          <InlineField
            label="Funding Raised"
            field={fields.funding}
            placeholder={FIELD_PLACEHOLDERS.funding}
            onChange={(v) => onUpdateField("funding", v)}
            badge={<ConfidenceBadge {...fields.funding} />}
            type="number"
            min="0"
            max={String(SANE_MAX_AMOUNT)}
            step="1"
            prefix={currencySymbol}
          />
          {fundingLarge && <WarningChip message={LARGE_VALUE_WARNING} />}
        </div>
      </div>
    </SectionCard>
  );
}

export function TeamSummarySection({
  fields,
  onUpdateField,
}: {
  fields: CompanyFields;
  onUpdateField: (name: keyof CompanyFields, value: string) => void;
}) {
  return (
    <SectionCard icon={Users} title="Team & Operations Summary" delay={300}>
      <div className="grid grid-cols-2 gap-3">
        <InlineField
          label={FIELD_LABELS.team_size}
          field={fields.team_size}
          placeholder={FIELD_PLACEHOLDERS.team_size}
          onChange={(v) => onUpdateField("team_size", v)}
          badge={<ConfidenceBadge {...fields.team_size} />}
          type="number"
          min="0"
          max={String(SANE_MAX_COUNT)}
          step="1"
        />
        <InlineField
          label="Main Expenses"
          field={fields.main_expenses}
          placeholder={FIELD_PLACEHOLDERS.main_expenses}
          onChange={(v) => onUpdateField("main_expenses", v)}
          badge={<ConfidenceBadge {...fields.main_expenses} />}
        />
      </div>
    </SectionCard>
  );
}
