export type OnboardingStep =
  | "website"
  | "enriching"
  | "ai-error"
  | "company"
  | "ai-config"
  | "revenue"
  | "funding"
  | "expenses"
  | "team"
  | "creating"
  | "done";

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
}

export interface FundingRound {
  id?: string;
  selected?: boolean;
  name: string;
  type: "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus" | "debt" | "grant";
  amount: number;
  date: string;
  preMoneyValuation: number | null;
  dilutionPercent: number | null;
  notes?: string;
}

export interface HeadcountRole {
  id?: string;
  selected?: boolean;
  title: string;
  department: "Engineering" | "Sales" | "Marketing" | "Operations" | "General & Admin";
  employeeType: "full_time" | "part_time" | "contractor";
  salary: number;
  startDate: string;
}

export interface OperatingExpense {
  id?: string;
  selected?: boolean;
  name: string;
  category: "Cloud Infrastructure" | "Marketing" | "Office & Admin" | "Software & Tools";
  amount: number;
  startDate: string;
  isRecurring: boolean;
}

export interface RevenueStream {
  id?: string;
  selected?: boolean;
  name: string;
  type: "subscription" | "one_time" | "usage_based" | "services" | "marketplace" | "ecommerce" | "hardware";
  amount: number;
  quantity: number;
  startDate: string;
  notes?: string;
}

