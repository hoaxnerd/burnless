"use client";

/**
 * Connections page body — MCP home with two tabs (placement mockup option A,
 * expose spec B6): Connected (existing grid) | Your MCP. Owns the shared
 * page header; the active tab decides the header action. Tab control =
 * existing SegmentedControl (mockup .tabs pill: 13px/600, active surface-0 +
 * shadow — SegmentedControl's raised-surface style is the design-system
 * translation of that).
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ConnectionsGrid } from "./connections-grid";
import { YourMcpTab } from "./your-mcp-tab";

export function ConnectionsTabs({
  mcpEndpoint,
  userRole,
}: {
  mcpEndpoint: string;
  userRole: string;
}) {
  const [tab, setTab] = useState<"connected" | "your-mcp">("connected");
  const [tokenModalOpen, setTokenModalOpen] = useState(false);

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
        options={[
          { value: "connected", label: "Connected" },
          { value: "your-mcp", label: "Your MCP" },
        ]}
      />

      {tab === "connected" ? (
        <ConnectionsGrid hideHeader />
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
