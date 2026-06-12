"use client";

/* ── ScheduleEditor — controlled preset/cron editor (S3a Plan 4b §A6) ─────────
 *
 * A controlled editor: { value: cron, onChange: (cron) => void }. Renders a
 * frequency selector (Daily / Weekly / Monthly / Custom) + contextual fields:
 *   - time-of-day always (UTC, per the A5 preset contract)
 *   - weekday select for weekly
 *   - day-of-month select for monthly
 *   - a mono raw-cron <input> for Custom
 *
 * The initial preset is derived from `value` via cronToPreset(); a cron that
 * isn't a known preset falls back to "Custom" (raw editing). Every change
 * recompiles the cron via presetToCron() (or passes the raw cron through in
 * Custom mode) and emits it through onChange.
 *
 * Design-system: native <Select>/<Input> primitives + controlClass tokens
 * (rounded-xl, border-surface-300, brand focus ring). No hardcoded colors.
 */

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  cronToPreset,
  presetToCron,
  type SchedulePreset,
} from "@/lib/automations/schedule-presets";

type Frequency = "daily" | "weekly" | "monthly" | "custom";

interface ScheduleEditorProps {
  value: string;
  onChange: (cron: string) => void;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "HH:MM" 24h time string from hour/minute. */
function toTimeValue(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function ScheduleEditor({ value, onChange }: ScheduleEditorProps) {
  const initialPreset = cronToPreset(value);
  const initialFrequency: Frequency = initialPreset?.kind ?? "custom";

  // Working preset state. When the incoming cron is Custom we seed a sensible
  // default (daily 09:00) so switching INTO a preset frequency has values.
  const [frequency, setFrequency] = useState<Frequency>(initialFrequency);
  const [hour, setHour] = useState<number>(initialPreset?.hour ?? 9);
  const [minute, setMinute] = useState<number>(initialPreset?.minute ?? 0);
  const [weekday, setWeekday] = useState<number>(
    initialPreset && initialPreset.kind === "weekly" ? initialPreset.weekday : 1,
  );
  const [day, setDay] = useState<number>(
    initialPreset && initialPreset.kind === "monthly" ? initialPreset.day : 1,
  );
  const [rawCron, setRawCron] = useState<string>(value);

  function compile(next: {
    frequency?: Frequency;
    hour?: number;
    minute?: number;
    weekday?: number;
    day?: number;
  }): void {
    const freq = next.frequency ?? frequency;
    const h = next.hour ?? hour;
    const m = next.minute ?? minute;
    const wd = next.weekday ?? weekday;
    const d = next.day ?? day;

    if (freq === "custom") {
      onChange(rawCron);
      return;
    }

    let preset: SchedulePreset;
    if (freq === "daily") {
      preset = { kind: "daily", hour: h, minute: m };
    } else if (freq === "weekly") {
      preset = { kind: "weekly", hour: h, minute: m, weekday: wd };
    } else {
      preset = { kind: "monthly", hour: h, minute: m, day: d };
    }
    onChange(presetToCron(preset));
  }

  function handleFrequency(next: Frequency): void {
    setFrequency(next);
    compile({ frequency: next });
  }

  function handleTime(time: string): void {
    const [hStr, mStr] = time.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    setHour(h);
    setMinute(m);
    compile({ hour: h, minute: m });
  }

  function handleWeekday(next: number): void {
    setWeekday(next);
    compile({ weekday: next });
  }

  function handleDay(next: number): void {
    setDay(next);
    compile({ day: next });
  }

  function handleRawCron(next: string): void {
    setRawCron(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Frequency"
          value={frequency}
          onChange={(e) => handleFrequency(e.target.value as Frequency)}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="custom">Custom</option>
        </Select>

        {frequency !== "custom" && (
          <Input
            type="time"
            label="Time (UTC)"
            value={toTimeValue(hour, minute)}
            onChange={(e) => handleTime(e.target.value)}
          />
        )}
      </div>

      {frequency === "weekly" && (
        <Select
          label="Day of week"
          value={String(weekday)}
          onChange={(e) => handleWeekday(Number(e.target.value))}
        >
          {WEEKDAYS.map((name, idx) => (
            <option key={name} value={idx}>
              {name}
            </option>
          ))}
        </Select>
      )}

      {frequency === "monthly" && (
        <Select
          label="Day of month"
          value={String(day)}
          onChange={(e) => handleDay(Number(e.target.value))}
        >
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      )}

      {frequency === "custom" && (
        <Input
          label="Cron expression"
          className="font-mono"
          value={rawCron}
          onChange={(e) => handleRawCron(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      )}
    </div>
  );
}
