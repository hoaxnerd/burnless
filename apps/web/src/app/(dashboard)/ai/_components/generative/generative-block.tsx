"use client";
import type { UiBlockClient } from "../types";

export interface GenerativeBlockProps {
  component: string;
  props: Record<string, unknown>;
}

/**
 * Dispatches a server-emitted display component to its renderer.
 * Unknown names render a safe fallback (never throw — the model may emit a
 * component this client build doesn't know yet).
 */
export function GenerativeBlock({ component }: GenerativeBlockProps) {
  switch (component) {
    // component cases are added by each component task below.
    default:
      return (
        <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
          Unsupported component: {component}
        </div>
      );
  }
}

/** Render all display blocks attached to a message. */
export function GenerativeBlocks({ blocks }: { blocks: UiBlockClient[] }) {
  return (
    <>
      {blocks.map((b) => (
        <GenerativeBlock key={b.id} component={b.component} props={b.props} />
      ))}
    </>
  );
}
