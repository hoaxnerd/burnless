"use client";

/* ── AutomationEditModal — edit a scheduled job (S3a Plan 4b §B3) ─────────────
 *
 * Reuses the <Modal> primitive. Editable: name (<Input>), prompt (textarea),
 * schedule (<ScheduleEditor>), notifyPolicy (<Select>). `actionKind` is
 * INTRINSIC and NOT editable — shown as a read-only badge (the roundType-
 * immutability precedent): changing whether a job writes vs. only notifies
 * would invalidate its frozen tool allowlist + safety posture.
 *
 * On Save, builds the patch { name, prompt, schedule, notifyPolicy } and calls
 * onSave(patch) — the parent maps it to PATCH /api/automations/[id] + mutate().
 *
 * Design-system: Modal + Input + Select primitives + control-styles tokens;
 * no raw hex, no inline styles.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/control-styles";
import { ScheduleEditor } from "./schedule-editor";
import type { AutomationDto } from "@/lib/swr/hooks";

type NotifyPolicy = AutomationDto["notifyPolicy"];

export interface AutomationEditPatch {
  name: string;
  prompt: string;
  schedule: string;
  notifyPolicy: NotifyPolicy;
}

interface AutomationEditModalProps {
  open: boolean;
  job: AutomationDto;
  onClose: () => void;
  onSave: (patch: AutomationEditPatch) => void | Promise<void>;
}

export function AutomationEditModal({ open, job, onClose, onSave }: AutomationEditModalProps) {
  const [name, setName] = useState(job.name);
  const [prompt, setPrompt] = useState(job.prompt);
  const [schedule, setSchedule] = useState(job.schedule);
  const [notifyPolicy, setNotifyPolicy] = useState<NotifyPolicy>(job.notifyPolicy);
  const [saving, setSaving] = useState(false);

  const isNotify = job.actionKind === "notify";
  const kindTag = isNotify
    ? { label: "notify only", cls: "bg-highlight-50 text-highlight-600 border border-highlight-100" }
    : { label: "writes data", cls: "bg-accent-50 text-accent-600 border border-accent-100" };

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ name, prompt, schedule, notifyPolicy });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit automation" size="lg">
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="automation-prompt" className="text-sm font-medium text-surface-700">
            Prompt
          </label>
          <textarea
            id="automation-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className={controlClass(false, "resize-y")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-surface-700">Schedule</span>
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        </div>

        <Select
          label="Notifications"
          value={notifyPolicy}
          onChange={(e) => setNotifyPolicy(e.target.value as NotifyPolicy)}
        >
          <option value="smart">Smart — notify on meaningful change or failure</option>
          <option value="failures">Failures only</option>
          <option value="every">Every run</option>
          <option value="off">Off</option>
        </Select>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-surface-700">Action kind</span>
          <div>
            <span
              className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${kindTag.cls}`}
            >
              {kindTag.label}
            </span>
            <p className="mt-1 text-xs text-surface-500">
              Intrinsic to the job and can&apos;t be changed after creation.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-200 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            state={saving ? "loading" : "idle"}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
