"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api-fetch";
import { useState } from "react";
import { useLocale } from "@/components/locale/locale-context";

interface Investor {
  id: string;
  name: string;
  email: string | null;
  amountInvested: string;
}

export function InvestorList({ roundId }: { roundId: string }) {
  const { data, mutate } = useSWR<{ investors: Investor[] }>(
    `/api/funding-rounds/${roundId}/investors`,
    (url: string) => apiFetch(url).then((r) => r.json()),
  );
  const { fmtCurrency } = useLocale();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");

  const submit = async () => {
    const res = await apiFetch(`/api/funding-rounds/${roundId}/investors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: email || undefined, amountInvested: Number(amount) }),
    });
    if (res.ok) {
      setAdding(false); setName(""); setEmail(""); setAmount("");
      mutate();
    }
  };

  const remove = async (investorId: string) => {
    const res = await apiFetch(`/api/funding-rounds/${roundId}/investors/${investorId}`, {
      method: "DELETE",
    });
    if (res.ok) mutate();
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Investors</div>
      <ul className="space-y-1">
        {(data?.investors ?? []).map((inv) => (
          <li key={inv.id} className="flex items-center justify-between p-2 border rounded">
            <div>
              <div className="text-sm">{inv.name}</div>
              {inv.email && <div className="text-xs text-muted">{inv.email}</div>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm">{fmtCurrency(Number(inv.amountInvested))}</span>
              <button type="button" className="btn-ghost-sm" onClick={() => remove(inv.id)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="flex gap-2 items-end">
          <input className="input-sm flex-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input-sm flex-1" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input-sm w-32" type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="button" className="btn-primary-sm" onClick={submit}>Add</button>
          <button type="button" className="btn-ghost-sm" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="btn-outline-sm" onClick={() => setAdding(true)}>+ Add investor</button>
      )}
    </div>
  );
}
