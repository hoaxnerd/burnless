import type { CompanyFields } from "./types";

export const FIELD_LABELS: Record<keyof CompanyFields, string> = {
  company_name: "Company Name",
  stage: "Stage",
  business_model: "Business Model",
  industry: "Industry",
};

export const FIELD_PLACEHOLDERS: Record<keyof CompanyFields, string> = {
  company_name: "My Startup Inc.",
  stage: "Pre-seed",
  business_model: "SaaS",
  industry: "Fintech",
};

export const DEFAULTS: CompanyFields = {
  company_name: { value: "", confidence: "low", source: "default" },
  stage: { value: "Pre-seed", confidence: "low", source: "default" },
  business_model: { value: "SaaS", confidence: "low", source: "default" },
  industry: { value: "", confidence: "low", source: "default" },
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
