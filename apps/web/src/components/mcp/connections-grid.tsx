"use client";

import { useState } from "react";
import { Plug, Plus } from "lucide-react";
import { AsyncData, Button, DataEmptyState, useQueryState } from "@/components/ui";
import { useMcpConnections } from "@/lib/swr/hooks";
import type { McpConnectionDto } from "./types";
import { ConnectionCard } from "./connection-card";
import { AddConnectionModal } from "./add-connection-modal";
import { ManageConnectionPanel } from "./manage-connection-panel";

/**
 * Connections page body — header + connection-card grid + Add-connection modal
 * + Manage panel (mockup: placement.html content area).
 *
 * Owns the modal state for both the add flow (Task 3) and the manage panel
 * (Task 4); the grid itself is pixel-matched to the mockup's `.grid` / `.conn`
 * blocks (2-col, 14px gap, dashed add-card).
 */
export function ConnectionsGrid() {
  const swr = useMcpConnections();
  const query = useQueryState(swr);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<McpConnectionDto | null>(null);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-surface-900 sm:text-2xl">
            Connections
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            Connect any MCP server. Your Companion can use their tools; you can
            browse their data.
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          Add connection
        </Button>
      </div>

      <AsyncData
        query={query}
        onRetry={() => void swr.mutate()}
        empty={
          <DataEmptyState
            title="Connect your first MCP server"
            body="Paste a server config or URL — your Companion can use its tools, and you can browse its data."
            icon={Plug}
            action={
              <Button
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setAdding(true)}
              >
                Add connection
              </Button>
            }
          />
        }
      >
        {(connections) => (
          <div className="grid gap-3.5 md:grid-cols-2">
            {connections.map((c) => (
              <ConnectionCard key={c.id} connection={c} onManage={setManaging} />
            ))}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-surface-200 bg-surface-0 text-[13px] font-semibold text-surface-500 transition-colors hover:border-surface-300 hover:text-surface-600"
            >
              <Plus className="h-[18px] w-[18px] text-surface-400" strokeWidth={2} />
              Add a connection
            </button>
          </div>
        )}
      </AsyncData>

      <AddConnectionModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false);
          void swr.mutate();
        }}
      />
      <ManageConnectionPanel
        connection={managing}
        onClose={() => setManaging(null)}
      />
    </div>
  );
}
