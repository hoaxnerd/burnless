"use client";
import { GenMetricCard, type GenMetricCardProps } from "./metric-card";

export interface GenKpiGridProps {
  items: GenMetricCardProps[];
}

export function GenKpiGrid({ items }: GenKpiGridProps) {
  return (
    <div className="my-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item, i) => (
        <GenMetricCard key={`${item.label}-${i}`} {...item} />
      ))}
    </div>
  );
}
