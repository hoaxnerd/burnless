"use client";
import { PermissionCard } from "../../permission-card";
import type { PendingPermission } from "../../types";

/** The permission/diff gate, rendered in-stream as a worklog node (spec §4.6).
 *  Reuses PermissionCard (which hosts the DiffGate when an override is present). */
export function DiffGateNode({
  pending,
  onDecide,
}: {
  pending: PendingPermission;
  onDecide: (pending: PendingPermission, decisions: { requestId: string; decision: "once" | "session" | "deny" }[]) => void;
}) {
  return <PermissionCard pending={pending} onDecide={(decisions) => onDecide(pending, decisions)} />;
}
