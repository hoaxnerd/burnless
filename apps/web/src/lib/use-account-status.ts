"use client";
import useSWR from "swr";
import { apiFetch } from "@/lib/api-fetch";

export interface AccountStatus { email: string; isClaimed: boolean }

const fetcher = async (url: string): Promise<AccountStatus> => {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error("status");
  return res.json();
};

/** Live account claim state. Mutate after a successful claim to refresh the UI. */
export function useAccountStatus() {
  const { data, error, isLoading, mutate } = useSWR<AccountStatus>("/api/auth/account-status", fetcher);
  return { status: data, error, isLoading, refresh: mutate };
}
