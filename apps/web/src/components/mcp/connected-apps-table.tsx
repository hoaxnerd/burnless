"use client";

/**
 * Connected apps table (mockup §1): OAuth grants with app initial chip,
 * scopes, authorized date, two-click Revoke (kills the grant family).
 */
import { useState } from "react";
import { useLocale } from "@/components/locale/locale-context";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-fetch";
import { PermClassTag } from "./perm-class-tag";
import type { OauthGrantDto } from "./types";

export function ConnectedAppsTable({
  grants,
  onChanged,
}: {
  grants: OauthGrantDto[];
  onChanged: () => void;
}) {
  const { fmtDate } = useLocale();
  const { success, error } = useToast();
  const [armedId, setArmedId] = useState<string | null>(null);

  async function revoke(grant: OauthGrantDto) {
    try {
      const res = await apiFetch(`/api/oauth/grants/${grant.grantId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("revoke failed");
      success(`Revoked ${grant.clientName}'s access`);
      onChanged();
    } catch {
      error("Could not revoke the app — please retry.");
    } finally {
      setArmedId(null);
    }
  }

  return (
    <div className="mb-3.5 rounded-xl border border-surface-200 bg-surface-0 px-[18px] py-[15px]">
      <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-surface-900">
        Connected apps
      </h3>
      <p className="mt-[3px] text-xs text-surface-500">
        Apps you authorized via OAuth. Revoking cuts their access instantly.
      </p>
      {grants.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-surface-400">No apps authorized yet.</p>
      ) : (
        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr>
              {["App", "Scopes", "Authorized", ""].map((h, i) => (
                <th
                  key={i}
                  className="border-b border-surface-200 pb-2 pr-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-surface-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.grantId} className="border-b border-surface-100 last:border-b-0">
                <td className="py-[11px] pr-2.5 align-middle">
                  <span className="mr-2.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-surface-700 align-middle text-xs font-bold text-white">
                    {g.clientName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="align-middle text-[12.5px] font-semibold text-surface-900">
                    {g.clientName}
                  </span>
                </td>
                <td className="py-[11px] pr-2.5 align-middle">
                  <span className="flex gap-1">
                    {g.scopes.map((s) => (
                      <PermClassTag key={s} cls={s} />
                    ))}
                  </span>
                </td>
                <td className="py-[11px] pr-2.5 align-middle text-[12.5px] text-surface-700">
                  {fmtDate(g.createdAt)}
                </td>
                <td className="py-[11px] text-right align-middle">
                  {armedId === g.grantId ? (
                    <button
                      type="button"
                      aria-label={`Confirm revoke ${g.clientName}`}
                      onBlur={() => setArmedId(null)}
                      onClick={() => void revoke(g)}
                      className="rounded bg-danger-50 px-2 py-1 text-xs font-bold text-danger-600"
                    >
                      Confirm?
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Revoke app ${g.clientName}`}
                      onClick={() => setArmedId(g.grantId)}
                      className="text-xs font-semibold text-danger-600"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
