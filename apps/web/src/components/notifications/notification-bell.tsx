"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useNotifications, type NotificationDto } from "@/lib/swr/hooks";
import { apiFetch } from "@/lib/api-fetch";
import { KEYS } from "@/lib/swr";

const SEVERITY_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;
const SEVERITY_TONE = {
  info: "text-surface-400",
  success: "text-success-600",
  warning: "text-warning-600",
  error: "text-danger-600",
} as const;

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data, mutate } = useNotifications();
  const unread = data?.unreadCount ?? 0;
  const items = data?.notifications ?? [];

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function patch(payload: Record<string, unknown>) {
    await apiFetch(KEYS.notifications, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    void mutate();
  }

  return (
    <div className="relative">
      <button
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            data-testid="notif-unread-dot"
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-danger-500 ring-1 ring-surface-0"
          />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={`absolute z-50 mt-2 w-80 max-h-[60vh] overflow-auto rounded-2xl border border-surface-200 bg-surface-0 shadow-xl ${
              collapsed ? "left-0" : "right-0"
            }`}
          >
            <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
              <span className="text-sm font-semibold text-surface-900">Notifications</span>
              {items.length > 0 && (
                <button
                  onClick={() => void patch({ markAllRead: true })}
                  className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-surface-500">No notifications yet.</p>
            ) : (
              <ul>
                {items.map((n) => (
                  <Row
                    key={n.id}
                    n={n}
                    onClick={() => void patch({ ids: [n.id] })}
                    onNavigate={async (link) => {
                      await patch({ ids: [n.id] });
                      router.push(link);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  n,
  onClick,
  onNavigate,
}: {
  n: NotificationDto;
  onClick: () => void;
  onNavigate: (link: string) => Promise<void>;
}) {
  const Icon = SEVERITY_ICON[n.severity];
  const body = (
    <div className={`flex gap-2.5 px-4 py-3 ${n.readAt ? "opacity-60" : "bg-brand-100/40"}`}>
      <Icon className={`mt-0.5 h-4 w-4 flex-none ${SEVERITY_TONE[n.severity]}`} />
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-surface-900">{n.title}</p>
        {n.body && <p className="mt-0.5 text-[11.5px] text-surface-500">{n.body}</p>}
        <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-surface-400">
          {n.category} · {timeAgo(n.createdAt)}
        </p>
      </div>
    </div>
  );
  return (
    <li className="border-b border-surface-100 last:border-b-0">
      {n.link ? (
        <a
          href={n.link}
          onClick={(e) => {
            e.preventDefault();
            void onNavigate(n.link!);
          }}
          className="block hover:bg-surface-50"
        >
          {body}
        </a>
      ) : (
        <button onClick={onClick} className="block w-full text-left hover:bg-surface-50">
          {body}
        </button>
      )}
    </li>
  );
}
