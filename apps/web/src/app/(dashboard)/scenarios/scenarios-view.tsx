"use client";

import { useMemo, type ReactNode } from "react";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui/page-grid";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
import { PageProvider } from "@/components/providers/page-context";
import { ScenarioInsightsWrapper } from "./scenario-insights-wrapper";
import { ScenarioCards } from "./scenario-cards";

interface ScenarioItem {
  id: string;
  name: string;
  description: string | null;
  source: string;
  status: string;
  color: string | null;
  createdAt: string;
}

export function ScenariosView({ scenarios }: { scenarios: ScenarioItem[] }) {
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
    <PageLayoutProvider pageId="scenarios">
      <PageProvider pageId="scenarios">
        <ScenariosPageGrid
          widgets={widgets}
          defaultLayoutLG={defaultLayoutLG}
          defaultLayoutSM={defaultLayoutSM}
        />
      </PageProvider>
    </PageLayoutProvider>
  );
}

function ScenariosPageGrid({
  widgets,
  defaultLayoutLG,
  defaultLayoutSM,
}: {
  widgets: Record<string, ReactNode>;
  defaultLayoutLG: DefaultLayoutItem[];
  defaultLayoutSM: DefaultLayoutItem[];
}) {
  const layout = usePageLayoutContext();
  return (
    <PageGrid
      widgets={widgets}
      defaultLayoutLG={defaultLayoutLG}
      defaultLayoutSM={defaultLayoutSM}
      savedLayout={layout.savedLayout}
      onLayoutChange={layout.onLayoutChange}
      closedWidgets={layout.closedWidgets}
      onCloseWidget={layout.onCloseWidget}
      onOpenWidget={layout.onOpenWidget}
      onReset={layout.onReset}
      widgetReadiness={layout.widgetReadiness}
      isLoading={layout.isLoading}
      isEditMode={layout.isEditMode}
      setIsEditMode={layout.setIsEditMode}
    />
  );
}
