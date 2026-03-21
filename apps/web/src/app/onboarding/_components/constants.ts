import type { CompanyFields } from "./types";

export const FIELD_LABELS: Record<keyof CompanyFields, string> = {
  company_name: "Company Name",
  stage: "Stage",
  business_model: "Business Model",
  industry: "Industry",
  monthly_revenue: "Monthly Revenue",
  team_size: "Team Size",
  funding: "Funding Raised",
  main_expenses: "Main Expenses",
};

export const FIELD_PLACEHOLDERS: Record<keyof CompanyFields, string> = {
  company_name: "My Startup Inc.",
  stage: "Pre-seed",
  business_model: "SaaS",
  industry: "Fintech",
  monthly_revenue: "$0",
  team_size: "3",
  funding: "$0",
  main_expenses: "Salaries, Cloud, Marketing",
};

export const DEFAULTS: CompanyFields = {
  company_name: { value: "", confidence: "low", source: "default" },
  stage: { value: "Pre-seed", confidence: "low", source: "default" },
  business_model: { value: "SaaS", confidence: "low", source: "default" },
  industry: { value: "", confidence: "low", source: "default" },
  monthly_revenue: { value: "$0", confidence: "low", source: "default" },
  team_size: { value: "1", confidence: "low", source: "default" },
  funding: { value: "$0", confidence: "low", source: "default" },
  main_expenses: { value: "General operations", confidence: "low", source: "default" },
};

export const STAGE_OPTIONS = [
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B+",
  "Bootstrapped",
];

export const MODEL_OPTIONS = [
  "SaaS",
  "Marketplace",
  "E-commerce",
  "Services",
  "Hardware",
  "Other",
];
