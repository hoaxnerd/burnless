"use client";

import { useMemo } from "react";
import { SwappableMetricCard, PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { usePageLayout } from "@/components/ui/use-page-layout";
import { FundingDetails } from "./funding-details";

interface FundingViewProps {
  totalRaised: number;
  completedRoundsCount: number;
  currentCash: number;
  currentBurn: number;
  currentRunway: number;
  foundersOwnership: number;
  totalDilution: number;
  rounds: Array<{
    id: string;
    name: string;
    type: string;
    amount: number;
    date: string;
    preMoneyValuation: number | null;
    dilutionPercent: number | null;
    isProjected: boolean;
  }>;
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export function FundingView({
  totalRaised,
  completedRoundsCount,
  currentCash,
  currentBurn,
  currentRunway,
  foundersOwnership,
  totalDilution,
  rounds,
}: FundingViewProps) {
  const pageLayout = usePageLayout({ pageId: "funding" });

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-cards", x: 0, w: 12, h: 5, minH: 4 },
    { i: "details",      x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const widgets = useMemo(() => ({
    "metric-cards": (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <SwappableMetricCard
          slug="totalRaised"
          pageId="funding"
          label="Total Raised"
          value={totalRaised > 0 ? formatCurrency(totalRaised) : "$---"}
          description={totalRaised > 0 ? `${completedRoundsCount} round${completedRoundsCount !== 1 ? "s" : ""} completed` : "Add a funding round"}
        />
        <SwappableMetricCard
          slug="currentCash"
          pageId="funding"
          label="Current Cash"
          value={currentCash > 0 ? formatCurrency(currentCash) : "$---"}
          description={currentCash > 0 ? "Available capital" : "Add funding to see cash"}
        />
        <SwappableMetricCard
          slug="runway"
          pageId="funding"
          label="Runway"
          value={currentBurn > 0 && currentCash > 0 ? (currentRunway >= 999 ? "\u221e" : `${Math.round(currentRunway)} months`) : "-- mo"}
          description={currentBurn > 0 && currentCash > 0 ? `At ${formatCurrency(currentBurn)}/mo burn` : "Add funding & expenses"}
          variant={currentRunway > 0 && currentRunway < 6 ? "danger" : currentRunway < 12 ? "warning" : "default"}
        />
        <SwappableMetricCard
          slug="founderOwnership"
          pageId="funding"
          label="Founder Ownership"
          value={completedRoundsCount > 0 ? `${foundersOwnership.toFixed(0)}%` : "--%"}
          description={completedRoundsCount > 0 ? `After ${totalDilution.toFixed(0)}% dilution` : "Add a funding round"}
        />
      </div>
    ),
    "details": (
      <FundingDetails
        rounds={rounds}
        foundersOwnership={foundersOwnership}
        currentCash={currentCash}
        currentBurn={currentBurn}
        currentRunway={currentRunway}
      />
    ),
  }), [totalRaised, completedRoundsCount, currentCash, currentBurn, currentRunway, foundersOwnership, totalDilution, rounds]);

  return (
    <PageGrid
      widgets={widgets}
      defaultLayoutLG={defaultLayoutLG}
      {...pageLayout}
    />
  );
}
