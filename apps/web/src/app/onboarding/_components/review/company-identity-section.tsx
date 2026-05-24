import { Building2 } from "lucide-react";
import type { CompanyFields } from "../types";
import { FIELD_LABELS, FIELD_PLACEHOLDERS, STAGE_OPTIONS, MODEL_OPTIONS } from "../constants";
import { ConfidenceBadge } from "../confidence-badge";
import { SectionCard, InlineField, ToggleGroup } from "./primitives";

interface Props {
  fields: CompanyFields;
  onUpdateField: (name: keyof CompanyFields, value: string) => void;
  nameError?: string;
  onNameBlur: () => void;
  userName: string;
  onUserNameChange: (next: string) => void;
  /** Suggested founder names — clicking a chip fills `userName`. */
  suggestedFounders: string[];
}

export function CompanyIdentitySection({
  fields,
  onUpdateField,
  nameError,
  onNameBlur,
  userName,
  onUserNameChange,
  suggestedFounders,
}: Props) {
  return (
    <SectionCard icon={Building2} title="Company Identity" delay={100}>
      <div className="space-y-4">
        <InlineField
          label={FIELD_LABELS.company_name}
          field={fields.company_name}
          placeholder={FIELD_PLACEHOLDERS.company_name}
          onChange={(v) => onUpdateField("company_name", v)}
          onBlur={onNameBlur}
          required
          error={nameError}
          badge={<ConfidenceBadge {...fields.company_name} />}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <ToggleGroup
              label={FIELD_LABELS.stage}
              options={STAGE_OPTIONS}
              value={fields.stage.value}
              onChange={(v) => onUpdateField("stage", v)}
              badge={<ConfidenceBadge {...fields.stage} />}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <ToggleGroup
              label={FIELD_LABELS.business_model}
              options={MODEL_OPTIONS}
              value={fields.business_model.value}
              onChange={(v) => onUpdateField("business_model", v)}
              badge={<ConfidenceBadge {...fields.business_model} />}
            />
          </div>
        </div>
        <InlineField
          label={FIELD_LABELS.industry}
          field={fields.industry}
          placeholder={FIELD_PLACEHOLDERS.industry}
          onChange={(v) => onUpdateField("industry", v)}
          badge={<ConfidenceBadge {...fields.industry} />}
        />

        <div className="space-y-3 pt-4 border-t border-surface-200 dark:border-surface-700">
          <InlineField
            label="Your Name"
            field={{ value: userName, source: userName ? "user" : "default" }}
            placeholder="E.g. Jane Doe"
            onChange={onUserNameChange}
          />
          {suggestedFounders.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
                Suggested Founders (Click to fill):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {suggestedFounders.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onUserNameChange(name)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-all duration-150 ${
                      userName === name
                        ? "bg-brand-50 border-brand-500 text-brand-700 dark:bg-brand-950 dark:border-brand-400 dark:text-brand-300 shadow-sm"
                        : "bg-surface-0 border-surface-200 text-surface-600 hover:bg-surface-50 dark:bg-surface-900 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
