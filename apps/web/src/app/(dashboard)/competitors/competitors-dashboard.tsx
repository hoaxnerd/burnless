"use client";

/**
 * Competitor analysis dashboard (reframe): one expandable card per competitor,
 * an at-a-glance recent-change-activity headline collapsed, full analysis on
 * expand. Management (CRUD) lives at /competitors/manage — mirrors the
 * transactions → accounts nesting. Design-system components + tokens only.
 */

import Link from "next/link";
import { Swords, Settings2 } from "lucide-react";
import { Button, DataEmptyState } from "@/components/ui";
import { CompetitorCard, type CompetitorCardData } from "./competitor-card";

export type { CompetitorCardData };

export function CompetitorsDashboard({ cards }: { cards: CompetitorCardData[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Competitors</h1>
          <p className="mt-1 text-sm text-surface-500">
            Continuous analysis of each competitor — pricing, social, and page changes
          </p>
        </div>
        <Link href="/competitors/manage">
          <Button variant="secondary" icon={<Settings2 className="h-4 w-4" />}>Manage competitors</Button>
        </Link>
      </div>

      {cards.length === 0 ? (
        <DataEmptyState
          icon={Swords}
          title="No competitors tracked yet"
          body="Add a competitor to start monitoring their site, pricing, and social presence for changes."
          action={<Link href="/competitors/manage"><Button>Add competitor</Button></Link>}
        />
      ) : (
        <div className="grid gap-4">
          {cards.map((card) => (
            <CompetitorCard key={card.competitor.id} data={card} />
          ))}
        </div>
      )}
    </div>
  );
}
