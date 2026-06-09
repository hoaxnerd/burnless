/* ── Invite Codes – types, helpers & constants ────────────────── */
import { formatCurrency, formatDate as formatDateLocale, type CurrencyCode } from "@burnless/types";

export interface Redemption {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  redeemedAt: string;
}

export interface InviteCode {
  id: string;
  code: string;
  type: "single_use" | "multi_use";
  maxRedemptions: number;
  currentRedemptions: number;
  expiresAt: string | null;
  freePlatformDays: number;
  aiCreditsCents: number;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  redemptions: Redemption[];
}

export type CodeStatus = "active" | "expired" | "depleted" | "inactive";

export interface CodeFormData {
  code: string;
  type: "single_use" | "multi_use";
  maxRedemptions: number;
  expiresAt: string;
  freePlatformDays: number;
  aiCreditsCents: number;
  note: string;
}

/* ── Helpers ───────────────────────────────────────────────────── */

export function getCodeStatus(code: InviteCode): CodeStatus {
  if (!code.isActive) return "inactive";
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) return "expired";
  if (code.currentRedemptions >= code.maxRedemptions) return "depleted";
  return "active";
}

export const statusColors: Record<CodeStatus, string> = {
  active: "bg-success-100 text-success-700",
  expired: "bg-surface-100 text-surface-500",
  depleted: "bg-warning-100 text-warning-700",
  inactive: "bg-danger-100 text-danger-700",
};

export function formatDate(iso: string, locale?: string) {
  return formatDateLocale(new Date(iso), locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCredits(cents: number, currency: CurrencyCode = "USD", locale?: string) {
  return formatCurrency(cents / 100, currency, locale);
}

export const defaultForm: CodeFormData = {
  code: "",
  // SET-10: default to Single Use (the leftmost toggle) — a user who doesn't
  // touch Type creates a 1-redemption code, not a silent 50-redemption one.
  type: "single_use",
  maxRedemptions: 1,
  expiresAt: "",
  freePlatformDays: 30,
  aiCreditsCents: 5000,
  note: "",
};
