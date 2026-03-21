export type OnboardingStep = "website" | "enriching" | "review" | "creating" | "done";

export interface FieldData {
  value: string;
  confidence: "high" | "medium" | "low";
  source: "ai" | "user" | "default";
}

export interface CompanyFields {
  company_name: FieldData;
  stage: FieldData;
  business_model: FieldData;
  industry: FieldData;
  monthly_revenue: FieldData;
  team_size: FieldData;
  funding: FieldData;
  main_expenses: FieldData;
}
