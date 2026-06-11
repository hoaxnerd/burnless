"use client";

/**
 * Personal access tokens table (mockup §1): name + masked bl_pat_••••xxxx,
 * scope badges, expiry, last used, two-click Revoke (no native dialogs).
 */
import { useState } from "react";
import { useLocale } from "@/components/locale/locale-context";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-fetch";
import { PermClassTag } from "./perm-class-tag";
import type { ApiTokenDto } from "./types";

export function PatTable({
  tokens,
  onChanged,
}: {
  tokens: ApiTokenDto[];
  onChanged: () => void;
}) {
  const { fmtDate } = useLocale();
  const { success, error } = useToast();
  const [armedId, setArmedId] = useState<string | null>(null);

  async function revoke(token: ApiTokenDto) {
    try {
      const res = await apiFetch(`/api/tokens/${token.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("revoke failed");
      success(`Revoked "${token.name}"`);
      onChanged();
    } catch {
      error("Could not revoke the token — please retry.");
    } finally {
      setArmedId(null);
    }
  }

  return (
    <div className="mb-3.5 rounded-xl border border-surface-200 bg-surface-0 px-[18px] py-[15px]">
      <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-surface-900">
        Personal access tokens
      </h3>
      <p className="mt-[3px] text-xs text-surface-500">
        Tokens act as you, inside this company, capped by your role and the token&apos;s scopes.
      </p>
      {tokens.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-surface-400">
          No tokens yet — mint one with &quot;New token&quot; to connect an agent.
        </p>
      ) : (
        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr>
              {["Token", "Scopes", "Expires", "Last used", ""].map((h, i) => (
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
            {tokens.map((t) => (
              <tr key={t.id} className="border-b border-surface-100 last:border-b-0">
                <td className="py-[11px] pr-2.5 align-middle">
                  <div className="text-[12.5px] font-semibold text-surface-900">{t.name}</div>
                  <div className="font-mono text-[10.5px] text-surface-400">{`bl_pat_••••${t.lastFour}`}</div>
                </td>
                <td className="py-[11px] pr-2.5 align-middle">
                  <span className="flex gap-1">
                    {t.scopes.map((s) => (
                      <PermClassTag key={s} cls={s} />
                    ))}
                  </span>
                </td>
                <td className="py-[11px] pr-2.5 align-middle text-[12.5px] text-surface-700">
                  {t.expiresAt ? fmtDate(t.expiresAt) : "Never"}
                </td>
                <td className="py-[11px] pr-2.5 align-middle text-[12.5px] text-surface-700">
                  {t.lastUsedAt ? fmtDate(t.lastUsedAt) : "—"}
                </td>
                <td className="py-[11px] text-right align-middle">
                  {armedId === t.id ? (
                    <button
                      type="button"
                      aria-label={`Confirm revoke ${t.name}`}
                      onBlur={() => setArmedId(null)}
                      onClick={() => void revoke(t)}
                      className="rounded bg-danger-50 px-2 py-1 text-xs font-bold text-danger-600"
                    >
                      Confirm?
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Revoke token ${t.name}`}
                      onClick={() => setArmedId(t.id)}
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
