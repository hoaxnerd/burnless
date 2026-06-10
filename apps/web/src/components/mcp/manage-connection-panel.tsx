"use client";

import type { McpConnectionDto } from "./types";

/**
 * ManageConnectionPanel — per-tool control + remove/authenticate for one
 * connection.
 *
 * Null-rendering stub so the Connections grid compiles (Plan 2 Task 2);
 * Task 4 replaces this with the real panel.
 */
export interface ManageConnectionPanelProps {
  connection: McpConnectionDto | null;
  onClose: () => void;
}

export function ManageConnectionPanel(_props: ManageConnectionPanelProps) {
  return null;
}
