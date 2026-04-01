/**
 * SWR fetcher — typed JSON fetcher with error handling.
 *
 * On non-2xx responses, throws an Error with the server error message
 * so SWR can expose it via the `error` return value.
 */

import { apiFetch } from "@/lib/api-fetch";

export class FetchError extends Error {
  status: number;
  info: Record<string, unknown>;

  constructor(message: string, status: number, info: Record<string, unknown> = {}) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.info = info;
  }
}

export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await apiFetch(url);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new FetchError(
      body.error || `Request failed (${res.status})`,
      res.status,
      body,
    );
  }

  return res.json();
}
