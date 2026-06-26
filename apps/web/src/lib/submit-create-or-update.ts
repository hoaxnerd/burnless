import { apiFetch } from "@/lib/api-fetch";

/**
 * Create-or-update submit shared by the simple add/edit modal forms
 * (transactions, accounts): `POST basePath` to create, `PATCH basePath/{id}`
 * to edit. Throws `Error(server message ?? fallback)` when the response is not
 * ok; the caller owns success (close + router.refresh) and surfaces the error.
 *
 * `id === null` ⇒ create (POST); a non-null id ⇒ edit (PATCH).
 */
export async function submitCreateOrUpdate(opts: {
  basePath: string;
  id: string | null;
  payload: unknown;
  entityLabel: string;
}): Promise<void> {
  const { basePath, id, payload, entityLabel } = opts;
  const res =
    id === null
      ? await apiFetch(basePath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await apiFetch(`${basePath}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to ${id === null ? "create" : "update"} ${entityLabel}`);
  }
}
