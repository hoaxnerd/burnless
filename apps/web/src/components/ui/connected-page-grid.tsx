"use client";

import { usePageLayoutContext } from "@/components/providers/page-layout-context";
import { PageGrid, type PageGridProps } from "./page-grid";

type ConnectedProps = Pick<
  PageGridProps,
  "widgets" | "defaultLayoutLG" | "defaultLayoutSM" | "staticHiddenWidgets"
>;

export function ConnectedPageGrid(props: ConnectedProps) {
  const layout = usePageLayoutContext();
  return (
    <PageGrid
      {...props}
      order={layout.order}
      onReorder={layout.onReorder}
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
