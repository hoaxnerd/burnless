"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";
import useSWR from "swr";
import { KEYS, revalidate } from "@/lib/swr";
import {
  Loader2,
  Plus,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Trash2,
  Users,
  Calendar,
  Gift,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";

import type { InviteCode, CodeFormData } from "./invite-codes-types";
import {
  getCodeStatus,
  statusColors,
  formatDate,
  formatCredits,
  defaultForm,
} from "./invite-codes-types";
import { CodeFormModal } from "./code-form-modal";
import { RedemptionsModal } from "./redemptions-modal";

/* ── Main Tab Component ────────────────────────────────────────── */

export function InviteCodesTab() {
  // Read snapshot now lives on the shared SWR cache (DFL-01). Mutations call
  // revalidate(KEYS.adminInviteCodes) so the table refreshes without a reload.
  const {
    data: codes,
    error: loadError,
    isLoading,
  } = useSWR<InviteCode[]>(KEYS.adminInviteCodes);
  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit modal
  const [editCode, setEditCode] = useState<InviteCode | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Redemptions modal
  const [redemptionsCode, setRedemptionsCode] = useState<InviteCode | null>(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const reloadCodes = () => revalidate(KEYS.adminInviteCodes);

  /* ── CRUD handlers ─────────────────────────────────────────── */

  const handleCreate = async (form: CodeFormData) => {
    setCreateSaving(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        type: form.type,
        maxRedemptions: form.type === "single_use" ? 1 : form.maxRedemptions,
        freePlatformDays: form.freePlatformDays,
        aiCreditsCents: form.aiCreditsCents,
      };
      if (form.code) body.code = form.code;
      if (form.expiresAt) body.expiresAt = new Date(form.expiresAt).toISOString();
      if (form.note) body.note = form.note;

      const res = await apiFetch("/api/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(toUserMessage(data) || "Failed to create");
        return;
      }
      setCreateOpen(false);
      reloadCodes();
    } catch {
      setCreateError("Failed to create invite code");
    } finally {
      setCreateSaving(false);
    }
  };

  const handleEdit = async (form: CodeFormData) => {
    if (!editCode) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = {
        maxRedemptions: form.type === "single_use" ? 1 : form.maxRedemptions,
        freePlatformDays: form.freePlatformDays,
        aiCreditsCents: form.aiCreditsCents,
        note: form.note || null,
      };
      if (form.expiresAt) {
        body.expiresAt = new Date(form.expiresAt).toISOString();
      } else {
        body.expiresAt = null;
      }

      const res = await apiFetch(`/api/admin/invite-codes/${editCode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setEditError(toUserMessage(data) || "Failed to update");
        return;
      }
      setEditCode(null);
      reloadCodes();
    } catch {
      setEditError("Failed to update invite code");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleActive = async (code: InviteCode) => {
    await apiFetch(`/api/admin/invite-codes/${code.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !code.isActive }),
    });
    reloadCodes();
  };

  // SET-09 — hard-delete a never-redeemed code. Redeemed codes have no delete
  // affordance (server returns 409); deactivate via the toggle instead.
  const deleteCode = async (code: InviteCode) => {
    if (code.currentRedemptions > 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Permanently delete invite code ${code.code}? This can't be undone.`)
    ) {
      return;
    }
    const res = await apiFetch(`/api/admin/invite-codes/${code.id}`, {
      method: "DELETE",
    });
    if (res.ok) reloadCodes();
  };

  const copyLink = (code: InviteCode) => {
    const url = `${window.location.origin}/login?invite=${code.code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(code.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  /* ── Render ────────────────────────────────────────────────── */

  if (loadError) {
    // ESL-3 — never render a silent blank on read error.
    const is403 =
      typeof loadError === "object" &&
      loadError !== null &&
      "status" in loadError &&
      (loadError as { status?: number }).status === 403;
    return (
      <div className="rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center">
        <p className="text-sm text-danger-700">
          {is403 ? "Admin access required" : "Failed to load invite codes"}
        </p>
      </div>
    );
  }

  if (isLoading || !codes) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-surface-400" />
      </div>
    );
  }

  const columns = [
    {
      key: "code",
      header: "Code",
      sortValue: (row: InviteCode) => row.code,
      render: (row: InviteCode) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium text-surface-900">{row.code}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyLink(row);
            }}
            className="p-1 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors"
            title="Copy invite link"
          >
            {copiedId === row.id ? (
              <Check className="h-3.5 w-3.5 text-success-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row: InviteCode) => getCodeStatus(row),
      render: (row: InviteCode) => {
        const status = getCodeStatus(row);
        return (
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}
          >
            {status}
          </span>
        );
      },
    },
    {
      key: "redemptions",
      header: "Redemptions",
      align: "center" as const,
      sortValue: (row: InviteCode) => row.currentRedemptions,
      render: (row: InviteCode) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setRedemptionsCode(row);
          }}
          className="text-sm text-surface-600 hover:text-brand-600 transition-colors"
          title="View redemptions"
        >
          {row.currentRedemptions}/{row.maxRedemptions}
        </button>
      ),
    },
    {
      key: "perks",
      header: "Perks",
      render: (row: InviteCode) => (
        <div className="flex items-center gap-3 text-xs text-surface-500">
          <span className="inline-flex items-center gap-1">
            <Gift className="h-3 w-3" />
            {row.freePlatformDays}d free
          </span>
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {/* AI credits are platform-priced in USD (we pay AI providers in USD). */}
            {/* Don't use the company's currency. */}
            {formatCredits(row.aiCreditsCents)} AI
          </span>
        </div>
      ),
    },
    {
      key: "expiresAt",
      header: "Expires",
      sortValue: (row: InviteCode) =>
        row.expiresAt ? new Date(row.expiresAt).getTime() : Infinity,
      render: (row: InviteCode) => (
        <span className="text-sm text-surface-500">
          {row.expiresAt ? formatDate(row.expiresAt) : "Never"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      sortValue: (row: InviteCode) => new Date(row.createdAt).getTime(),
      render: (row: InviteCode) => (
        <span className="text-sm text-surface-400">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right" as const,
      render: (row: InviteCode) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditCode(row);
            }}
            className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleActive(row);
            }}
            className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors"
            title={row.isActive ? "Deactivate" : "Reactivate"}
          >
            {row.isActive ? (
              <ToggleRight className="h-4 w-4 text-success-600" />
            ) : (
              <ToggleLeft className="h-4 w-4 text-surface-400" />
            )}
          </button>
          {row.currentRedemptions === 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteCode(row);
              }}
              className="p-1.5 rounded-lg hover:bg-danger-50 text-surface-400 hover:text-danger-600 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  // Summary stats
  const activeCodes = codes.filter((c) => getCodeStatus(c) === "active").length;
  const totalRedemptions = codes.reduce((s, c) => s + c.currentRedemptions, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-900">Invite Codes</h2>
          <p className="text-sm text-surface-500 mt-0.5">
            Create and manage invite codes for early access distribution
          </p>
        </div>
        <Button
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setCreateError(null);
            setCreateOpen(true);
          }}
        >
          New Code
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-surface-200 bg-surface-0 px-4 py-3">
          <div className="flex items-center gap-2 text-surface-500 text-xs mb-1">
            <Calendar className="h-3.5 w-3.5" />
            Total Codes
          </div>
          <p className="text-xl font-semibold text-surface-900">{codes.length}</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-surface-0 px-4 py-3">
          <div className="flex items-center gap-2 text-success-600 text-xs mb-1">
            <ToggleRight className="h-3.5 w-3.5" />
            Active
          </div>
          <p className="text-xl font-semibold text-surface-900">{activeCodes}</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-surface-0 px-4 py-3">
          <div className="flex items-center gap-2 text-brand-600 text-xs mb-1">
            <Users className="h-3.5 w-3.5" />
            Redemptions
          </div>
          <p className="text-xl font-semibold text-surface-900">{totalRedemptions}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-surface-200 bg-surface-0 overflow-hidden">
        <DataTable
          columns={columns}
          data={codes}
          rowKey={(r) => r.id}
          emptyMessage="No invite codes yet. Create one to get started."
        />
      </div>

      {/* Note about codes */}
      {codes.length > 0 && codes.some((c) => c.note) && (
        <div className="space-y-1">
          {codes
            .filter((c) => c.note)
            .map((c) => (
              <p key={c.id} className="text-xs text-surface-400">
                <span className="font-mono">{c.code}</span>: {c.note}
              </p>
            ))}
        </div>
      )}

      {/* Create Modal */}
      <CodeFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        initial={defaultForm}
        mode="create"
        saving={createSaving}
        error={createError}
      />

      {/* Edit Modal */}
      <CodeFormModal
        open={!!editCode}
        onClose={() => setEditCode(null)}
        onSubmit={handleEdit}
        initial={
          editCode
            ? {
                code: editCode.code,
                type: editCode.type,
                maxRedemptions: editCode.maxRedemptions,
                expiresAt: editCode.expiresAt
                  ? new Date(editCode.expiresAt).toISOString().slice(0, 16)
                  : "",
                freePlatformDays: editCode.freePlatformDays,
                aiCreditsCents: editCode.aiCreditsCents,
                note: editCode.note || "",
              }
            : defaultForm
        }
        mode="edit"
        saving={editSaving}
        error={editError}
      />

      {/* Redemptions Modal */}
      <RedemptionsModal
        open={!!redemptionsCode}
        onClose={() => setRedemptionsCode(null)}
        code={redemptionsCode}
      />
    </div>
  );
}
