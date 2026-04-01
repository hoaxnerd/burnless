"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui/page-grid";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
import { PageProvider } from "@/components/providers/page-context";
import { PromoteDialog } from "@/components/scenarios/promote-dialog";
import { ScenarioInsightsWrapper } from "./scenario-insights-wrapper";
import { ScenarioCards } from "./scenario-cards";

export interface ScenarioItem {
  id: string;
  name: string;
  description: string | null;
  source: string;
  status: string;
  color: string | null;
  overrideCount: number;
  autoDeleteAt: string | null;
  sourceScenarioId: string | null;
  createdAt: string;
}

export function ScenariosView({ scenarios }: { scenarios: ScenarioItem[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const promoteId = searchParams.get("promote");

  // Find the scenario to promote (if URL has ?promote=scenarioId)
  const promoteScenario = promoteId
    ? scenarios.find((s) => s.id === promoteId) ?? null
    : null;
  // Dialog is open when a promote scenario is present via URL, or explicitly opened
  const [dismissedPromote, setDismissedPromote] = useState(false);
  const promoteOpen = !!promoteScenario && !dismissedPromote;

  const handlePromoteClose = () => {
    setDismissedPromote(true);
    // Remove the query param from the URL
    const url = new URL(window.location.href);
    url.searchParams.delete("promote");
    router.replace(url.pathname + url.search, { scroll: false });
  };

  const handlePromoted = () => {
    handlePromoteClose();
    router.refresh();
  };

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

        {/* Promote dialog triggered by URL param */}
        {promoteScenario && (
          <PromoteDialog
            open={promoteOpen}
            onClose={handlePromoteClose}
            scenarioId={promoteScenario.id}
            scenarioName={promoteScenario.name}
            onPromoted={handlePromoted}
          />
        )}
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
