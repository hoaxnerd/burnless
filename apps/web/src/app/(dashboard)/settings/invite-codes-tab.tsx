"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Users,
  Calendar,
  Gift,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DataTable } from "@/components/ui/data-table";

/* ── Types ─────────────────────────────────────────────────────── */

interface Redemption {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  redeemedAt: string;
}

interface InviteCode {
  id: string;
  code: string;
  type: "single_use" | "multi_use";
  maxRedemptions: number;
  currentRedemptions: number;
  expiresAt: string | null;
  freePlatformDays: number;
  aiCreditsCents: number;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  redemptions: Redemption[];
}

type CodeStatus = "active" | "expired" | "depleted" | "inactive";

/* ── Helpers ───────────────────────────────────────────────────── */

function getCodeStatus(code: InviteCode): CodeStatus {
  if (!code.isActive) return "inactive";
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) return "expired";
  if (code.currentRedemptions >= code.maxRedemptions) return "depleted";
  return "active";
}

const statusColors: Record<CodeStatus, string> = {
  active: "bg-success-100 text-success-700",
  expired: "bg-surface-100 text-surface-500",
  depleted: "bg-warning-100 text-warning-700",
  inactive: "bg-danger-100 text-danger-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCredits(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

/* ── Create / Edit Form ────────────────────────────────────────── */

interface CodeFormData {
  code: string;
  type: "single_use" | "multi_use";
  maxRedemptions: number;
  expiresAt: string;
  freePlatformDays: number;
  aiCreditsCents: number;
  note: string;
}

const defaultForm: CodeFormData = {
  code: "",
  type: "multi_use",
  maxRedemptions: 50,
  expiresAt: "",
  freePlatformDays: 30,
  aiCreditsCents: 5000,
  note: "",
};

function CodeFormModal({
  open,
  onClose,
  onSubmit,
  initial,
  mode,
  saving,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CodeFormData) => void;
  initial: CodeFormData;
  mode: "create" | "edit";
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<CodeFormData>(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const set = <K extends keyof CodeFormData>(k: K, v: CodeFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Create Invite Code" : "Edit Invite Code"}
      size="md"
    >
      <div className="space-y-4">
        {/* Code */}
        {mode === "create" && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Code
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="Auto-generated if left empty"
              className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 font-mono"
            />
          </div>
        )}

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Type
          </label>
          <div className="flex gap-2">
            {(["single_use", "multi_use"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  set("type", t);
                  if (t === "single_use") set("maxRedemptions", 1);
                }}
                className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  form.type === t
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-surface-300 text-surface-600 hover:bg-surface-50"
                }`}
              >
                {t === "single_use" ? "Single Use" : "Multi Use"}
              </button>
            ))}
          </div>
        </div>

        {/* Max Redemptions (only for multi_use) */}
        {form.type === "multi_use" && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Max Redemptions
            </label>
            <input
              type="number"
              min={1}
              max={10000}
              value={form.maxRedemptions}
              onChange={(e) => set("maxRedemptions", parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
          </div>
        )}

        {/* Expiry */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Expiry Date
            <span className="text-surface-400 font-normal ml-1">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => set("expiresAt", e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
          />
        </div>

        {/* Free Days + AI Credits — side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Free Platform Days
            </label>
            <input
              type="number"
              min={0}
              max={365}
              value={form.freePlatformDays}
              onChange={(e) => set("freePlatformDays", parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              AI Credits ($)
            </label>
            <input
              type="number"
              min={0}
              max={1000}
              value={form.aiCreditsCents / 100}
              onChange={(e) =>
                set("aiCreditsCents", Math.round((parseFloat(e.target.value) || 0) * 100))
              }
              className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Note
            <span className="text-surface-400 font-normal ml-1">(optional)</span>
          </label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="e.g. YC batch, ProductHunt launch"
            maxLength={500}
            className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
          />
        </div>

        {error && (
          <p className="text-sm text-danger-600 bg-danger-50 px-3 py-2 rounded-xl">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            state={saving ? "loading" : "idle"}
            onClick={() => onSubmit(form)}
          >
            {mode === "create" ? "Create Code" : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Redemptions Detail Modal ──────────────────────────────────── */

function RedemptionsModal({
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

/* ── Main Tab Component ────────────────────────────────────────── */

export function InviteCodesTab() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const loadCodes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invite-codes");
      if (!res.ok) {
        if (res.status === 403) {
          setError("Admin access required");
        } else {
          setError("Failed to load invite codes");
        }
        return;
      }
      const data = await res.json();
      setCodes(data);
      setError(null);
    } catch {
      setError("Failed to load invite codes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

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

      const res = await fetch("/api/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Failed to create");
        return;
      }
      setCreateOpen(false);
      loadCodes();
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

      const res = await fetch(`/api/admin/invite-codes/${editCode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error || "Failed to update");
        return;
      }
      setEditCode(null);
      loadCodes();
    } catch {
      setEditError("Failed to update invite code");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleActive = async (code: InviteCode) => {
    await fetch(`/api/admin/invite-codes/${code.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !code.isActive }),
    });
    loadCodes();
  };

  const copyLink = (code: InviteCode) => {
    const url = `${window.location.origin}/signup?invite=${code.code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(code.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  /* ── Render ────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-surface-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center">
        <p className="text-sm text-danger-700">{error}</p>
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
