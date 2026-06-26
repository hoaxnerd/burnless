"use client";

/**
 * Connections page body — MCP home with up to three tabs (placement mockup
 * option A, expose spec B6): Connected MCPs (existing grid) | Your MCP |
 * Integrations (gated on `caps.integrations`). Owns the shared page header; the
 * active tab decides the header action. Tab control = existing SegmentedControl
 * (mockup .tabs pill: 13px/600, active surface-0 + shadow — SegmentedControl's
 * raised-surface style is the design-system translation of that).
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useCapabilities } from "@/components/providers/capability-context";
import { IntegrationsTabContainer } from "@/components/integrations/integrations-tab-container";
import { ConnectionsGrid } from "./connections-grid";
import { YourMcpTab } from "./your-mcp-tab";

type ConnectionsTab = "connected" | "your-mcp" | "integrations";

export function ConnectionsTabs({
  mcpEndpoint,
  userRole,
}: {
  mcpEndpoint: string;
  userRole: string;
}) {
  const caps = useCapabilities();
  // Honor a `?tab=` deep-link. Integrations is only a valid target when the
  // capability is on (else it falls back to the default "connected").
  const searchParams = useSearchParams();
  const initialTab: ConnectionsTab = (() => {
    const t = searchParams.get("tab");
    if (t === "your-mcp") return "your-mcp";
    if (t === "integrations" && caps.integrations) return "integrations";
    return "connected";
  })();
  const [tab, setTab] = useState<ConnectionsTab>(initialTab);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);

  const tabOptions: { value: ConnectionsTab; label: string }[] = [
    { value: "connected", label: "Connected MCPs" },
    { value: "your-mcp", label: "Your MCP" },
    ...(caps.integrations
      ? [{ value: "integrations" as const, label: "Integrations" }]
      : []),
  ];

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-surface-900 sm:text-2xl">
            Connections
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            Connect any MCP server — or let your agents connect to Burnless.
          </p>
        </div>
        {tab === "your-mcp" && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setTokenModalOpen(true)}>
            New token
          </Button>
        )}
      </div>

      <SegmentedControl
        className="mb-5"
        label="MCP view"
        size="sm"
        value={tab}
        onChange={setTab}
        options={tabOptions}
      />

      {tab === "connected" ? (
        <ConnectionsGrid hideHeader />
      ) : tab === "integrations" ? (
        <IntegrationsTabContainer />
      ) : (
        <YourMcpTab
          mcpEndpoint={mcpEndpoint}
          userRole={userRole}
          tokenModalOpen={tokenModalOpen}
          onTokenModalChange={setTokenModalOpen}
        />
      )}
    </div>
  );
}
