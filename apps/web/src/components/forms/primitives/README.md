# Form Primitives Kit

Shared form primitives for the data-entry pages. Locked in by the data-entry
umbrella (`docs/superpowers/specs/2026-04-24-data-entry-umbrella-design.md`
§1.7) and finalized in Phase 3 F.

## Components

| Component         | Purpose                                       | Engine boundary                              |
| ----------------- | --------------------------------------------- | -------------------------------------------- |
| `DateRangePicker` | Two side-by-side date inputs + "no end" flag  | Emits ISO date strings (`YYYY-MM-DD`)        |
| `CurrencyInput`   | Number input prefixed by the active currency  | Reads currency via `useLocale()`; emits raw `number` |
| `PercentageInput` | 0–100 display ↔ 0–1 engine value              | Emits the 0–1 fractional value               |
| `NumberInput`     | Bare number input with min/max/integer mode   | Emits `number \| null`                       |
| `SingleDateInput` | Single ISO-YYYY-MM-DD date input matching the kit's prop conventions (label, required, disabled, hint). Use for any single-field date — close date, effective date, milestone due date, vesting date. For ranges use `<DateRangePicker>`. | ≥2 (funding round-fields, team child-row UIs) |

## Prop conventions

Every primitive accepts the same three optional UX props:

- `required?: boolean` — adds the red asterisk in the label and the native
  `required` attribute on the input.
- `disabled?: boolean` — disables the input(s) and dims them.
- `hint?: string` — short helper text rendered below the input in
  `text-xs text-surface-500`.

The first two required props are always `value` and `onChange`. Labels are
required strings (`label` for single-field primitives, `startLabel`/`endLabel`
for the range picker — both defaulted).

## Promotion rule

A UI element graduates into this directory only after it has **≥ 2 production
call sites across distinct sub-projects** (umbrella §1.7). No primitive is
pre-built speculatively.

Current page-local primitives that have **not** met the bar (kept local on
purpose — re-evaluate when a second consumer appears):

- `apps/web/src/app/(dashboard)/expenses/components/FrequencySelector.tsx` —
  single consumer (`expense-form.tsx`). Would graduate if the team page adds a
  payroll-cadence selector.
- `apps/web/src/app/(dashboard)/funding/round-fields/MilestoneEditor.tsx` —
  single consumer (`GrantFields.tsx`). Would graduate if another round type
  ever needs a milestone list.

## Phase history

- **Phase 0** (2026-04-24): landing zone established (none of the four
  primitives yet — kit was empty).
- **Phase 1-B** (revenue, 2026-04-30): first three primitives shipped
  (`DateRangePicker`, `CurrencyInput`, `PercentageInput`) once revenue and
  funding both needed them.
- **Phase 1-C** (expenses, 2026-04-30): `NumberInput` joined the kit.
  `FrequencySelector` stayed local (one consumer).
- **Phase 2-D** (funding, 2026-05-18): no new promotions. `MilestoneEditor`
  stayed local (one consumer).
- **Phase 3-F** (this README, 2026-05-19): consolidation pass.
  `LocalDateRangePicker` fork deleted in favor of the canonical primitive.
  `hint` prop added to `DateRangePicker` for prop-shape uniformity across the
  kit. Promotion rule re-affirmed; no demotions or new promotions.
- **Phase 4 D** (2026-05-25): Added `SingleDateInput` (≥2 consumers).
  Swept `expenses/forecast-method-fields/`, `team/employee-type-fields/`
  and team child-row UIs, and `funding/round-fields/` to use the kit
  consistently. 30+ raw `<input type="number">` / `<input type="date">`
  swapped across 19 files (~8 expenses, 23 team, 8 funding).
  Regression test `apps/web/src/__tests__/no-raw-form-inputs.test.ts`
  blocks reintroduction across 23 files.
