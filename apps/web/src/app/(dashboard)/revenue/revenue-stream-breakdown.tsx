"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { ratioToPct } from "@burnless/engine";
import { BarChartWidget, chartColors, formatCompactCurrency } from "@/components/charts";
import { ChartCard, Modal } from "@/components/ui";
import type { StreamBreakdown } from "@/lib/compute-revenue";
import { RevenueStreamForm, type RevenueStreamFormValues } from "./revenue-stream-form";
import { OverrideIndicator } from "@/components/scenarios/override-indicator";
import { HiddenEntitiesSection } from "@/components/scenarios/hidden-entities-section";
import { useScenarioOverrides } from "@/components/scenarios/use-scenario-overrides";

interface EditRevenueStream {
  id: string;
  name: string;
  type: string;
  startDate?: string | null;
  endDate?: string | null;
  parameters: Record<string, unknown>;
}

interface RevenueStreamBreakdownProps {
  streams: StreamBreakdown[];
  monthlyByStream: Record<string, unknown>[];
  streamNames: string[];
  totalRevenue: number;
  scenarioId: string;
}

const typeLabels: Record<string, string> = {
  subscription: "SaaS",
  one_time: "One-Time",
  usage_based: "Usage",
  services: "Services",
  marketplace: "Marketplace",
  ecommerce: "E-commerce",
  hardware: "Hardware",
};

const typeColors: Record<string, string> = {
  subscription: "#2563eb",
  one_time: "#10b981",
  usage_based: "#7c3aed",
  services: "#f59e0b",
  marketplace: "#059669",
  ecommerce: "#e11d48",
  hardware: "#64748b",
};

export function RevenueStreamBreakdown({
  streams,
  monthlyByStream,
  streamNames,
  totalRevenue,
  scenarioId,
}: RevenueStreamBreakdownProps) {
  const router = useRouter();
  const [editingStream, setEditingStream] = useState<EditRevenueStream | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {
    isInScenarioMode,
    overrideMap,
    deletedEntities,
    handleRevert,
    handleRemove,
    handleRestore,
  } = useScenarioOverrides("revenue_stream");

  const [editSubmitting, setEditSubmitting] = useState(false);

  if (streams.length === 0 && deletedEntities.length === 0) return null;

  async function handleEditSubmit(values: RevenueStreamFormValues) {
    if (!editingStream) return;
    setEditSubmitting(true);
    try {
      const res = await apiFetch(`/api/revenue-streams/${editingStream.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update revenue stream");
      }
      setEditingStream(null);
      router.refresh();
    } finally {
      setEditSubmitting(false);
    }
  }

  // Build stacked chart bars (max 6 streams, rest grouped)
  const topStreams = streamNames.slice(0, 6);
  const chartBars = topStreams.map((name, i) => {
    const stream = streams.find((s) => s.name === name);
    const color = stream ? (typeColors[stream.type] ?? chartColors.palette[i % chartColors.palette.length] ?? "#94a3b8") : (chartColors.palette[i % chartColors.palette.length] ?? "#94a3b8");
    return {
      dataKey: name,
      label: name,
      color,
      stackId: "revenue",
    };
  });

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this revenue stream? This action cannot be undone.")) return;

    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/revenue-streams/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete");
      }
      router.refresh();
    } catch {
      // Error is handled silently; the stream remains if delete fails
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Stacked revenue by stream chart */}
      <div className="lg:col-span-2">
        <ChartCard title="Revenue by Stream" subtitle="Monthly contribution from each revenue source">
          <BarChartWidget data={monthlyByStream} bars={chartBars} height={280} />
        </ChartCard>
      </div>

      {/* Stream proportions */}
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <h3 className="text-sm font-semibold text-surface-900 mb-4">Revenue Mix</h3>
        <div className="space-y-3">
          {streams.map((stream, i) => {
            const color = typeColors[stream.type] ?? chartColors.palette[i % chartColors.palette.length] ?? "#94a3b8";
            const changeIcon = stream.changePercent > 0.01 ? "\u2191" : stream.changePercent < -0.01 ? "\u2193" : "\u2192";
            const changeColor = stream.changePercent > 0.01 ? "text-green-500" : stream.changePercent < -0.01 ? "text-red-500" : "text-surface-400";
            const isDeleting = deletingId === stream.id;
            const override = isInScenarioMode ? overrideMap.get(stream.id) : undefined;
            const overrideTag = override?.action === "modify" ? "modified" as const : override?.action === "create" ? "created" as const : null;

            return (
              <OverrideIndicator
                key={stream.id}
                override={overrideTag}
                entityName={stream.name}
                onRevert={() => handleRevert(stream.id)}
                onRemove={() => handleRemove(stream.id)}
              >
                <div className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs font-medium text-surface-700 truncate">{stream.name}</span>
                      <span className="text-[9px] text-surface-400 flex-shrink-0">{typeLabels[stream.type] ?? stream.type}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold tabular-nums text-surface-900">
                        {formatCompactCurrency(stream.currentRevenue)}
                      </span>
                      <span className={`text-[10px] font-medium ${changeColor}`}>
                        {changeIcon}{Math.abs(ratioToPct(stream.changePercent)).toFixed(0)}%
                      </span>
                      {/* Edit/delete actions — visible on hover */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            setEditingStream({
                              id: stream.id,
                              name: stream.name,
                              type: stream.type,
                              parameters: stream.parameters,
                            })
                          }
                          className="rounded p-1 text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          aria-label={`Edit ${stream.name}`}
                          title="Edit stream"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(stream.id)}
                          disabled={isDeleting}
                          className="rounded p-1 text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                          aria-label={`Delete ${stream.name}`}
                          title="Delete stream"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(stream.percentage, 100)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              </OverrideIndicator>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-surface-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500">Total Monthly</span>
            <span className="text-sm font-bold tabular-nums text-surface-900">
              {formatCompactCurrency(totalRevenue)}
            </span>
          </div>
        </div>

        {isInScenarioMode && (
          <HiddenEntitiesSection
            deletedEntities={deletedEntities}
            entityLabel="revenue stream"
            onRestore={handleRestore}
          />
        )}
      </div>

      {/* Edit modal (controlled) */}
      {editingStream && (
        <Modal
          open={!!editingStream}
          onClose={() => setEditingStream(null)}
          title={`Edit: ${editingStream.name}`}
        >
          <RevenueStreamForm
            mode="edit"
            initial={{
              name: editingStream.name,
              type: editingStream.type as RevenueStreamFormValues["type"],
              startDate: editingStream.startDate ?? new Date().toISOString().slice(0, 10),
              endDate: editingStream.endDate ?? null,
              parameters: editingStream.parameters,
            }}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditingStream(null)}
            submitting={editSubmitting}
          />
        </Modal>
      )}
    </div>
  );
}
