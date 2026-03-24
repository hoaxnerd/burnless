"use client";

import { Modal } from "@/components/ui/modal";
import type { InviteCode } from "./invite-codes-types";
import { formatDate } from "./invite-codes-types";

export function RedemptionsModal({
  open,
  onClose,
  code,
}: {
  open: boolean;
  onClose: () => void;
  code: InviteCode | null;
}) {
  if (!code) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Redemptions — ${code.code}`} size="md">
      {code.redemptions.length === 0 ? (
        <p className="text-sm text-surface-400 text-center py-8">
          No redemptions yet
        </p>
      ) : (
        <div className="space-y-2">
          {code.redemptions.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-50 text-sm"
            >
              <div>
                <span className="font-medium text-surface-800">
                  {r.userName || "Unknown"}
                </span>
                <span className="text-surface-400 ml-2">{r.userEmail}</span>
              </div>
              <span className="text-surface-400 text-xs">
                {formatDate(r.redeemedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
