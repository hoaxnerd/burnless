"use client";

/**
 * Competitors browse + manage view (Task 14). Lightweight DataTable (not the
 * metric grid), mirroring the WS2 transactions-view pattern: SSR-seeded SWR
 * (useCompetitors fallbackData) that live-updates via the competitor mutation
 * bus, an "Add competitor" Modal, and useConfirm-gated delete. No currency on
 * this surface.
 */

import { useState } from "react";
import Link from "next/link";
import { Swords, Trash2, ExternalLink, ArrowLeft, Rss } from "lucide-react";
import {
  DataTable,
  Button,
  Modal,
  Input,
  DataEmptyState,
  useConfirm,
} from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";
import { useCompetitors, type CompetitorDto, type CompetitorsPayload } from "@/lib/swr";

interface CompetitorsViewProps {
  initialData: CompetitorsPayload;
}

/** Reuse-only status pill — no @/components/ui badge component exists, so a
 *  token-styled <span> (matches the transactions SourcePill precedent). NOT a
 *  new component. */
function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-success-50 text-success-700"
      : "bg-surface-100 text-surface-600";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase ${cls}`}>
      {status}
    </span>
  );
}

export function CompetitorsView({ initialData }: CompetitorsViewProps) {
  const { data, mutate } = useCompetitors({ fallbackData: initialData });
  const { confirm, dialog } = useConfirm();

  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = data?.competitors ?? [];

  async function handleDelete(row: CompetitorDto) {
    const ok = await confirm({
      title: "Delete competitor",
      body: `Delete "${row.name}"? This removes the competitor and its tracked sources and changes.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setActionError(null);
    try {
      const res = await apiFetch(`/api/competitors/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete competitor");
      }
      void mutate();
    } catch (err) {
      setActionError(toUserMessage(err));
    }
  }

  async function handleDetect(row: CompetitorDto) {
    setActionError(null);
    try {
      const res = await apiFetch(`/api/competitors/${row.id}/detect`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to detect feeds");
      }
      void mutate();
    } catch (err) {
      setActionError(toUserMessage(err));
    }
  }

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (r: CompetitorDto) => (
        <Link
          href={`/competitors/${r.id}`}
          className="font-medium text-surface-900 hover:text-brand-600 transition-colors"
        >
          {r.name}
        </Link>
      ),
      sortValue: (r: CompetitorDto) => r.name.toLowerCase(),
    },
    {
      key: "url",
      header: "URL",
      render: (r: CompetitorDto) => (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-surface-600 hover:text-brand-600 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {r.url}
          <ExternalLink className="h-3 w-3" />
        </a>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r: CompetitorDto) => <StatusPill status={r.status} />,
      sortValue: (r: CompetitorDto) => r.status,
    },
    {
      key: "actions",
      header: "",
      align: "right" as const,
      render: (r: CompetitorDto) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => handleDetect(r)}
            className="rounded-md p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            aria-label="Detect feeds"
            title="Detect RSS/sitemap feeds"
          >
            <Rss className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleDelete(r)}
            className="rounded-md p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            aria-label="Delete competitor"
            title="Delete competitor"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/competitors"
            className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Competitors
          </Link>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-surface-900">Manage competitors</h1>
          <p className="mt-1 text-sm text-surface-500">
            Add competitors and configure the pages we watch for changes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button icon={<Swords className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Add competitor
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600" role="alert">
          {actionError}
        </div>
      )}

      {rows.length === 0 ? (
        <DataEmptyState
          icon={Swords}
          title="No competitors tracked yet"
          body="Add a competitor to start monitoring their site, pricing, and social presence for changes."
          action={<Button onClick={() => setAdding(true)}>Add competitor</Button>}
        />
      ) : (
        <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
          <DataTable
            columns={columns}
            data={rows}
            rowKey={(r) => r.id}
            emptyMessage="No competitors yet. Add one to start tracking."
          />
        </div>
      )}

      {adding && (
        <AddCompetitorModal
          open={adding}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void mutate();
          }}
        />
      )}

      {dialog}
    </div>
  );
}

// ── Add competitor modal ───────────────────────────────────────────────────────

function AddCompetitorModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [pricingUrl, setPricingUrl] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const sources = [
        ...(pricingUrl ? [{ type: "pricing" as const, url: pricingUrl }] : []),
        ...(socialUrl ? [{ type: "social" as const, url: socialUrl }] : []),
        ...(pageUrl ? [{ type: "page" as const, url: pageUrl }] : []),
        ...(feedUrl ? [{ type: "feed" as const, url: feedUrl }] : []),
        ...(sitemapUrl ? [{ type: "sitemap" as const, url: sitemapUrl }] : []),
      ];
      const res = await apiFetch("/api/competitors", {
        method: "POST",
        body: JSON.stringify({ name, url, sources }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add competitor");
      }
      onAdded();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add competitor" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc."
          autoFocus
        />
        <Input
          label="Website URL"
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://acme.com"
        />
        <Input
          label="Pricing page URL"
          showOptional
          type="url"
          value={pricingUrl}
          onChange={(e) => setPricingUrl(e.target.value)}
          placeholder="https://acme.com/pricing"
          hint="We'll watch this page for pricing changes."
        />
        <Input
          label="Social URL"
          showOptional
          type="url"
          value={socialUrl}
          onChange={(e) => setSocialUrl(e.target.value)}
          placeholder="https://x.com/acme"
        />
        <Input
          label="Watch a page"
          showOptional
          type="url"
          value={pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          placeholder="https://acme.com/changelog"
          hint="Any page (changelog, careers, TOS) — we'll alert you when its content changes."
        />
        <Input
          label="RSS / Atom feed URL"
          showOptional
          type="url"
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="https://acme.com/blog/rss"
          hint="Blog / news / changelog feed — we track new posts. (We also auto-detect this.)"
        />
        <Input
          label="Sitemap URL"
          showOptional
          type="url"
          value={sitemapUrl}
          onChange={(e) => setSitemapUrl(e.target.value)}
          placeholder="https://acme.com/sitemap.xml"
          hint="We track pages appearing and disappearing."
        />

        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600" role="alert">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" state={submitting ? "loading" : "idle"}>
            Add competitor
          </Button>
        </div>
      </form>
    </Modal>
  );
}
