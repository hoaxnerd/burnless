"use client";

import { useMemo } from "react";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui/page-grid";
import { usePageLayout } from "@/components/ui/use-page-layout";
import { PageProvider } from "@/components/providers/page-context";
import { ScenarioInsightsWrapper } from "./scenario-insights-wrapper";
import { ScenarioCards } from "./scenario-cards";

interface ScenarioItem {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  isBudget: boolean;
  description: string | null;
  createdAt: string;
}

export function ScenariosView({ scenarios }: { scenarios: ScenarioItem[] }) {
  const pageLayout = usePageLayout({ pageId: "scenarios" });

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "insights", x: 0, w: 12, h: 4, minH: 3 },
    { i: "scenario-cards", x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(
    () => defaultLayoutLG.map((item) => ({ ...item, x: 0, w: 6 })),
    [defaultLayoutLG]
  );

  const widgets = useMemo(() => ({
    "insights": <ScenarioInsightsWrapper scenarios={scenarios} />,
    "scenario-cards": <ScenarioCards scenarios={scenarios} />,
  }), [scenarios]);

  return (
    <PageProvider pageId="scenarios">
      <PageGrid
        widgets={widgets}
        defaultLayoutLG={defaultLayoutLG}
        defaultLayoutSM={defaultLayoutSM}
        {...pageLayout}
      />
    </PageProvider>
  );
}
