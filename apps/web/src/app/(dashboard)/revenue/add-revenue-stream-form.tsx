"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { Plus } from "lucide-react";

const STREAM_TYPES = [
  { value: "subscription", label: "Subscription (SaaS)" },
  { value: "services", label: "Professional Services" },
  { value: "one_time", label: "One-Time Sales" },
  { value: "usage_based", label: "Usage-Based" },
] as const;

interface AddRevenueStreamFormProps {
  scenarioId: string;
}

export function AddRevenueStreamForm({ scenarioId }: AddRevenueStreamFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("subscription");

  // Subscription params
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [startingCustomers, setStartingCustomers] = useState("");
  const [newCustomersPerMonth, setNewCustomersPerMonth] = useState("");
  const [monthlyChurnRate, setMonthlyChurnRate] = useState("");

  // Services params
  const [hourlyRate, setHourlyRate] = useState("");
  const [monthlyHours, setMonthlyHours] = useState("");

  // One-time params
  const [unitPrice, setUnitPrice] = useState("");
  const [monthlyUnits, setMonthlyUnits] = useState("");

  // Usage-based params
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [expectedUnits, setExpectedUnits] = useState("");

  function buildParams(): Record<string, unknown> {
    switch (type) {
      case "subscription":
        return {
          monthlyPrice: Number(monthlyPrice),
          startingCustomers: Number(startingCustomers),
          newCustomersPerMonth: Number(newCustomersPerMonth),
          monthlyChurnRate: Number(monthlyChurnRate) / 100,
        };
      case "services":
        return {
          hourlyRate: Number(hourlyRate),
          monthlyHours: Number(monthlyHours),
        };
      case "one_time":
        return {
          unitPrice: Number(unitPrice),
          monthlyUnits: Number(monthlyUnits),
        };
      case "usage_based":
        return {
          pricePerUnit: Number(pricePerUnit),
          expectedUnits: Number(expectedUnits),
        };
      default:
        return {};
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/revenue-streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          name,
          type,
          parameters: buildParams(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create revenue stream");
      }

      // Reset
      setName("");
      setMonthlyPrice("");
      setStartingCustomers("");
      setNewCustomersPerMonth("");
      setMonthlyChurnRate("");
      setHourlyRate("");
      setMonthlyHours("");
      setUnitPrice("");
      setMonthlyUnits("");
      setPricePerUnit("");
      setExpectedUnits("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Revenue Stream
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Revenue Stream">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Growth Plan, Implementation Services"
              required
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {STREAM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-surface-200 pt-4">
            <p className="text-xs font-medium text-surface-500 uppercase mb-3">
              {type === "subscription" ? "Subscription Parameters" :
               type === "services" ? "Services Parameters" :
               type === "one_time" ? "One-Time Parameters" :
               "Usage-Based Parameters"}
            </p>

            {type === "subscription" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Price ($)</label>
                  <input type="number" value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)}
                    placeholder="99" required min="0" step="0.01"
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">Starting Customers</label>
                    <input type="number" value={startingCustomers} onChange={(e) => setStartingCustomers(e.target.value)}
                      placeholder="50" required min="0"
                      className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">New Customers/Mo</label>
                    <input type="number" value={newCustomersPerMonth} onChange={(e) => setNewCustomersPerMonth(e.target.value)}
                      placeholder="15" required min="0"
                      className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Churn Rate (%)</label>
                  <input type="number" value={monthlyChurnRate} onChange={(e) => setMonthlyChurnRate(e.target.value)}
                    placeholder="2.5" required min="0" max="100" step="0.1"
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
            )}

            {type === "services" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Hourly Rate ($)</label>
                  <input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="150" required min="0" step="0.01"
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Hours</label>
                  <input type="number" value={monthlyHours} onChange={(e) => setMonthlyHours(e.target.value)}
                    placeholder="40" required min="0"
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
            )}

            {type === "one_time" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Unit Price ($)</label>
                  <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="500" required min="0" step="0.01"
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Monthly Units</label>
                  <input type="number" value={monthlyUnits} onChange={(e) => setMonthlyUnits(e.target.value)}
                    placeholder="10" required min="0"
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
            )}

            {type === "usage_based" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Price per Unit ($)</label>
                  <input type="number" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)}
                    placeholder="0.10" required min="0" step="0.001"
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Expected Units/Mo</label>
                  <input type="number" value={expectedUnits} onChange={(e) => setExpectedUnits(e.target.value)}
                    placeholder="100000" required min="0"
                    className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
              {saving ? "Adding..." : "Add Stream"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
