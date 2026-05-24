import { DollarSign, Users } from "lucide-react";
import type { CompanyFields } from "../types";
import { FIELD_LABELS, FIELD_PLACEHOLDERS } from "../constants";
import { ConfidenceBadge } from "../confidence-badge";
import { SectionCard, InlineField } from "./primitives";

interface SummaryProps {
  fields: CompanyFields;
  onUpdateField: (name: keyof CompanyFields, value: string) => void;
  currencySymbol: string;
}

export function FinancialsSummarySection({ fields, onUpdateField, currencySymbol }: SummaryProps) {
  return (
    <SectionCard icon={DollarSign} title="Financials Overview" delay={200}>
      <div className="grid grid-cols-2 gap-3">
        <InlineField
          label="Monthly Revenue"
          field={fields.monthly_revenue}
          placeholder={FIELD_PLACEHOLDERS.monthly_revenue}
          onChange={(v) => onUpdateField("monthly_revenue", v)}
          badge={<ConfidenceBadge {...fields.monthly_revenue} />}
          type="number"
          min="0"
          step="1"
          prefix={currencySymbol}
        />
        <InlineField
          label="Funding Raised"
          field={fields.funding}
          placeholder={FIELD_PLACEHOLDERS.funding}
          onChange={(v) => onUpdateField("funding", v)}
          badge={<ConfidenceBadge {...fields.funding} />}
          type="number"
          min="0"
          step="1"
          prefix={currencySymbol}
        />
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
