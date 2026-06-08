"use client";

import { useEffect, useState } from "react";
import { Eye, Pencil, Trash2, Globe, MonitorPlay, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { useAiPermissions, revalidate, KEYS } from "@/lib/swr";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui";

type Mode = "ask" | "session" | "always";

type Defaults = {
  readMode: Mode;
  writeMode: Mode;
  deleteMode: "ask" | "session";
  webSearchMode: Mode;
  browserUseMode: Mode;
};

const FULL_MODES: { value: Mode; label: string }[] = [
  { value: "ask", label: "Ask" },
  { value: "session", label: "Allow for session" },
  { value: "always", label: "Always allow" },
];
const DELETE_MODES = FULL_MODES.filter((m) => m.value !== "always");

const CATEGORIES: {
  key: keyof Defaults;
  label: string;
  hint: string;
  icon: React.ReactNode;
  modes: { value: Mode; label: string }[];
}[] = [
  { key: "readMode", label: "Read data", hint: "Metrics, statements, comparisons", icon: <Eye className="h-4 w-4" />, modes: FULL_MODES },
  { key: "writeMode", label: "Create / update", hint: "Scenarios, headcount, revenue, expenses, funding", icon: <Pencil className="h-4 w-4" />, modes: FULL_MODES },
  { key: "deleteMode", label: "Delete", hint: "Destructive — no permanent allow", icon: <Trash2 className="h-4 w-4" />, modes: DELETE_MODES },
  { key: "webSearchMode", label: "Web search", hint: "Search the web + read pages", icon: <Globe className="h-4 w-4" />, modes: FULL_MODES },
  { key: "browserUseMode", label: "Browser use", hint: "Headless browser (anti-bot fallback)", icon: <MonitorPlay className="h-4 w-4" />, modes: FULL_MODES },
];

export function AiPermissionsPanel({ conversationId }: { conversationId: string | null }) {
  const { data, error } = useAiPermissions();
  // Local optimistic overlay on top of the SWR-loaded defaults so segmented
  // controls react instantly; reconciled with the cache on the next revalidation.
  const [overlay, setOverlay] = useState<Partial<Defaults>>({});
  const [saving, setSaving] = useState(false);

  // Reset the optimistic overlay whenever fresh server data arrives.
  useEffect(() => {
    setOverlay({});
  }, [data]);

  const defaults: Defaults | null = data ? { ...data.defaults, ...overlay } : null;

  async function setMode(key: keyof Defaults, value: Mode) {
    if (!defaults) return;
    setOverlay((prev) => ({ ...prev, [key]: value }));
    setSaving(true);
    try {
      await apiFetch("/api/ai/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      await revalidate(KEYS.aiPermissions);
    } finally {
      setSaving(false);
    }
  }

  async function resetGrants() {
    if (!conversationId) return;
    await apiFetch("/api/chat/reset-grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500">
        Could not load permissions. Reopen this panel to retry.
      </div>
    );
  }

  if (!defaults) {
    return <div className="p-4 text-sm text-surface-400">Loading permissions…</div>;
  }

  return (
    <div className="space-y-3 p-3">
      <p className="px-1 text-xs text-surface-500">
        Control what the AI can do on its own. Reads and searches are allowed by default.
      </p>
      {CATEGORIES.map((cat) => (
        <div key={cat.key} className="rounded-xl border border-surface-200 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-surface-500">{cat.icon}</span>
            <div>
              <p className="text-sm font-semibold text-surface-800">{cat.label}</p>
              <p className="text-[11px] text-surface-500">{cat.hint}</p>
            </div>
          </div>
          <SegmentedControl<Mode>
            label={cat.label}
            size="sm"
            value={defaults[cat.key] as Mode}
            onChange={(v) => setMode(cat.key, v)}
            options={cat.modes.map((m) => ({ value: m.value, label: m.label }))}
          />
        </div>
      ))}
      {conversationId && (
        <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetGrants}>
          Reset session grants for this chat
        </Button>
      )}
      {saving && <p className="px-1 text-[11px] text-surface-400">Saving…</p>}
    </div>
  );
}
