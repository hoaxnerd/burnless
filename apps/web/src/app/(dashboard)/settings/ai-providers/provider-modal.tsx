"use client";

import { useMemo, useState } from "react";
import { Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import {
  getCatalogEntry,
  listCatalogKinds,
  type ProviderKind,
} from "@burnless/ai";
import { Button, Input, Modal, useConfirm } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";
import {
  addAiProviderModel,
  createAiProvider,
  deleteAiProvider,
  discoverAiProviderModels,
  fetchAiProviderModels,
  setDefaultAiProviderModel,
  testAiProvider,
  updateAiProvider,
  useAiProviderModels,
} from "@/lib/swr";
import { ProviderLogo } from "./provider-logo";
import type { AiProviderPublic, ProviderTestState } from "./types";

interface ProviderModalProps {
  open: boolean;
  onClose: () => void;
  provider: AiProviderPublic | null;
  onSaved: () => void;
}

/**
 * Add / edit provider modal (#49 P3, Task 5). Create mode = catalog picker +
 * form; edit mode = locked kind + live Test/Fetch against the saved provider.
 * Pixel contract: docs/.../2026-06-13-universal-ai-provider/ai-providers-settings.html (.modal block).
 */
export function ProviderModal({ open, onClose, provider, onSaved }: ProviderModalProps) {
  const isEdit = provider != null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit provider" : "Add a provider"}
      size="xl"
      icon={
        <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[11px] bg-surface-100 text-surface-600">
          {isEdit ? <ProviderLogo kind={provider.kind} size={38} /> : <Plus className="h-[18px] w-[18px]" />}
        </div>
      }
    >
      {/* Remount the body when switching between create/edit (or providers) so
          local form state resets cleanly. */}
      <ModalBody key={provider?.id ?? "create"} provider={provider} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function ModalBody({
  provider,
  onClose,
  onSaved,
}: {
  provider: AiProviderPublic | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = provider != null;
  const { confirm, dialog } = useConfirm();

  const [kind, setKind] = useState<ProviderKind>((provider?.kind as ProviderKind) ?? "anthropic");
  const [selected, setSelected] = useState<boolean>(isEdit);
  const [name, setName] = useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [key, setKey] = useState("");
  const [defaultModel, setDefaultModel] = useState(provider?.defaultModelId ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testState, setTestState] = useState<ProviderTestState>("idle");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Pre-save discovery results (create-mode), before a provider id exists.
  const [discovered, setDiscovered] = useState<Array<{ modelId: string; source: string }>>([]);

  const models = useAiProviderModels(isEdit ? provider.id : null);
  const modelRows = models.data?.models ?? [];

  const keyless = kind === "ollama";
  const keyRequired = !keyless && kind !== "openai-compatible";
  const initialDefault = provider?.defaultModelId ?? "";

  const valid = useMemo(() => {
    if (name.trim().length === 0) return false;
    if (!isEdit) {
      if (!selected) return false;
      if (keyRequired && key.trim().length === 0) return false;
    }
    return true;
  }, [name, isEdit, selected, keyRequired, key]);

  function selectKind(k: ProviderKind) {
    setKind(k);
    setSelected(true);
    const entry = getCatalogEntry(k);
    setBaseUrl(entry?.defaultBaseUrl ?? "");
    setName(entry?.label ?? "");
    // A different provider's discovered models no longer apply.
    setDiscovered([]);
    setFetchError(null);
  }

  async function handleTest() {
    if (!isEdit) return;
    setTestState("testing");
    setTestMsg(null);
    try {
      const res = await testAiProvider(provider.id);
      if (res.ok) {
        setTestState("ok");
        setTestMsg(res.model ?? res.response ?? "Connected");
      } else {
        setTestState("error");
        setTestMsg(res.error ? toUserMessage(res.error) : "Test failed");
      }
    } catch {
      setTestState("error");
      setTestMsg("Connection error — check your network.");
    }
  }

  async function handleFetch() {
    setFetching(true);
    setFetchError(null);
    try {
      if (isEdit) {
        await fetchAiProviderModels(provider.id);
        await models.mutate();
      } else {
        // Pre-save discovery: works keyless for OpenRouter/Ollama and uses the
        // currently-entered key for key-required providers.
        const res = await discoverAiProviderModels({
          kind,
          baseUrl: baseUrl || undefined,
          apiKey: key || undefined,
        });
        setDiscovered(res.models);
        // Prefill the default-model field with the first result if empty.
        if (!defaultModel.trim() && res.models[0]) setDefaultModel(res.models[0].modelId);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? toUserMessage(err) : "Could not fetch models. Please try again.");
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    if (!valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (!isEdit) {
        const res = await createAiProvider({
          name: name.trim(),
          kind,
          baseUrl: baseUrl || undefined,
          apiKey: key || undefined,
          apiKeyMode: keyless ? "none" : "user_provided",
        });
        if (defaultModel.trim()) {
          await addAiProviderModel(res.provider.id, { modelId: defaultModel.trim(), isDefault: true });
        }
      } else {
        await updateAiProvider(provider.id, {
          name: name.trim(),
          baseUrl: baseUrl || null,
          ...(key ? { apiKey: key } : {}),
        });
        const next = defaultModel.trim();
        if (next && next !== initialDefault) {
          await setDefaultAiProviderModel(provider.id, next);
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? toUserMessage(err) : "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!isEdit) return;
    const ok = await confirm({
      title: "Remove provider",
      body: `Delete "${provider.name}"? This removes its stored key and models.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteAiProvider(provider.id);
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? toUserMessage(err) : "Remove failed. Please try again.");
    }
  }

  return (
    <div>
      <p className="mb-3 text-[13px] text-surface-500">
        {isEdit
          ? "Update credentials, fetch models, or test the connection."
          : "Pick a known provider (prefilled) or connect any OpenAI-compatible endpoint."}
      </p>

      {/* ── Step 1: catalog grid ── */}
      {isEdit ? (
        <CatalogTile kind={kind} selected disabled />
      ) : (
        <fieldset>
          <legend className="sr-only">Choose a provider</legend>
          <div className="grid grid-cols-4 gap-2.5">
            {listCatalogKinds().map((k) => (
              <CatalogTile
                key={k}
                kind={k}
                selected={selected && kind === k}
                onSelect={() => selectKind(k)}
              />
            ))}
          </div>
        </fieldset>
      )}

      {/* ── Step 2: configure ── */}
      <p className="mb-2.5 mt-6 text-[11px] font-bold uppercase tracking-[0.06em] text-surface-400">
        Step 2: configure
      </p>

      <div className="mb-4">
        <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="mb-4">
        <Input
          label="Base URL"
          className="font-mono"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          hint="Prefilled from the preset — editable for custom endpoints."
        />
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-semibold text-surface-700" htmlFor="ai-provider-key">
          API key
        </label>
        <div className="flex items-center gap-2.5">
          <Input
            id="ai-provider-key"
            type="password"
            className="flex-1 font-mono"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={isEdit && provider.apiKeySet ? "Leave blank to keep the saved key" : ""}
            aria-describedby="ai-provider-key-hint"
          />
          <Button
            type="button"
            variant="ghost"
            size="md"
            icon={<ShieldCheck className="h-[15px] w-[15px]" />}
            disabled={!isEdit}
            state={testState === "testing" ? "loading" : "idle"}
            onClick={handleTest}
          >
            Test
          </Button>
        </div>
        <p id="ai-provider-key-hint" className="mt-1.5 text-xs text-surface-400">
          {isEdit
            ? "Stored encrypted (SECRETS_ENCRYPTION_KEY). Never shown again after save. Local providers (Ollama/LM Studio) need no key."
            : "Save the provider first, then test. Stored encrypted (SECRETS_ENCRYPTION_KEY); local providers (Ollama/LM Studio) need no key."}
        </p>
        {testMsg != null && (
          <p className={`mt-1.5 text-xs ${testState === "error" ? "text-danger-600" : "text-success-600"}`}>
            {testState === "error" ? "Failed: " : "OK: "}
            {testMsg}
          </p>
        )}
      </div>

      {/* ── Models ── */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-surface-700">Models</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-[15px] w-[15px]" />}
            disabled={!isEdit && !selected}
            state={fetching ? "loading" : "idle"}
            onClick={handleFetch}
          >
            Fetch models
          </Button>
        </div>
        {isEdit ? (
          modelRows.length > 0 ? (
            <div className="max-h-[150px] overflow-auto rounded-[10px] border border-surface-200">
              {modelRows.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2.5 border-b border-surface-100 px-3 py-2.5 text-[13px] last:border-b-0"
                >
                  <input type="checkbox" className="accent-brand-600" checked={m.enabled} readOnly aria-readonly="true" />
                  <span className="font-mono text-[12.5px]">{m.modelId}</span>
                  {m.isDefault && <span className="ml-auto text-[10.5px] text-surface-400">★ default</span>}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-surface-400">
              No models yet — fetch from the endpoint, or set a default model id below.
            </p>
          )
        ) : discovered.length > 0 ? (
          <>
            <div className="max-h-[150px] overflow-auto rounded-[10px] border border-surface-200">
              {discovered.map((m) => (
                <button
                  type="button"
                  key={m.modelId}
                  onClick={() => setDefaultModel(m.modelId)}
                  className="flex w-full items-center gap-2.5 border-b border-surface-100 px-3 py-2.5 text-left text-[13px] last:border-b-0 hover:bg-surface-50"
                >
                  <span className="font-mono text-[12.5px]">{m.modelId}</span>
                  {defaultModel === m.modelId && (
                    <span className="ml-auto text-[10.5px] text-surface-400">★ default</span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-surface-400">
              Click a model to set it as the default. It is saved with the provider.
            </p>
          </>
        ) : (
          <p className="text-xs text-surface-400">
            Fetch the provider&rsquo;s available models — no API key needed for OpenRouter or local
            providers. Others use the key you enter above.
          </p>
        )}
        {fetchError && <p className="mt-1.5 text-xs text-danger-600">{fetchError}</p>}
      </div>

      {/* ── Default model ── */}
      <div className="mb-2">
        <Input
          label="Default model"
          className="font-mono"
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          hint='Tier routing (fast / standard / deep) can be fine-tuned under "Advanced routing".'
        />
      </div>

      {saveError && <p className="mb-2 text-xs text-danger-600">{saveError}</p>}

      {/* ── Footer ── */}
      <div className="-mx-6 mt-4 flex items-center justify-between border-t border-surface-200 bg-surface-50 px-6 py-3.5">
        <div>
          {isEdit && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              icon={<Trash2 className="h-[15px] w-[15px]" />}
              onClick={handleRemove}
            >
              Remove provider
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            state={saving ? "loading" : "idle"}
            disabled={!valid}
            onClick={handleSave}
          >
            Save provider
          </Button>
        </div>
      </div>
      {dialog}
    </div>
  );
}

function CatalogTile({
  kind,
  selected,
  disabled,
  onSelect,
}: {
  kind: ProviderKind;
  selected: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  const entry = getCatalogEntry(kind);
  const isCustom = kind === "openai-compatible";
  const label = isCustom ? "Custom" : entry?.label ?? kind;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={entry?.label ?? kind}
      disabled={disabled}
      onClick={onSelect}
      className={`flex flex-col items-center rounded-[11px] border p-3 text-center text-[12.5px] font-semibold transition-colors ${
        selected
          ? "border-brand-500 bg-brand-50 text-surface-700 ring-1 ring-brand-500"
          : "border-surface-200 bg-white text-surface-700 hover:border-brand-500 hover:bg-brand-50"
      } disabled:cursor-default`}
    >
      <span className="mb-2">
        <ProviderLogo kind={kind} size={30} />
      </span>
      {label}
      {(isCustom || kind === "ollama") && (
        <small className="mt-0.5 block text-[10.5px] font-normal text-surface-400">
          {isCustom ? "OpenAI-compat" : "local"}
        </small>
      )}
    </button>
  );
}
