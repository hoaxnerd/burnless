"use client";

/**
 * AsyncData — declarative loading / error / empty / data branch renderer for SWR
 * consumers [ESL-3]. Pass an SWR-shaped result (`{ data, error, isLoading }`) and
 * a `children` render fn for the happy path; AsyncData picks the branch.
 *
 * Error text is normalized through `toUserMessage` (lib/api-error) before it ever
 * reaches the screen, so raw server/Error strings never render.
 */

import type { ReactNode } from "react";
import { DataLoadError, classifyError } from "./data-load-error";
import { DataEmptyState, isEmpty as defaultIsEmpty } from "./data-empty-state";
import { Skeleton } from "./skeleton";
import { toUserMessage } from "@/lib/api-error";

/** The minimal SWR-shaped slice AsyncData needs. */
export interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
}

/**
 * useQueryState — adapt any SWR-ish result into the exact `QueryState` shape
 * AsyncData wants. Tolerates hooks that expose `isValidating` instead of
 * `isLoading` and treats an undefined+no-error state as loading.
 */
export function useQueryState<T>(result: {
  data: T | undefined;
  error?: unknown;
  isLoading?: boolean;
  isValidating?: boolean;
}): QueryState<T> {
  const error = result.error;
  const isLoading =
    result.isLoading ??
    (result.data === undefined && !error ? true : Boolean(result.isValidating));
  return { data: result.data, error, isLoading };
}

export interface AsyncDataProps<T> {
  /** SWR result (or any `{ data, error, isLoading }` slice). */
  query: QueryState<T>;
  /** Happy-path renderer — only called with non-empty, defined data. */
  children: (data: T) => ReactNode;
  /** Custom loading node. Defaults to a skeleton block. */
  loading?: ReactNode;
  /** Retry callback wired into the error branch. */
  onRetry?: () => void;
  /** Whether a retry is in progress. */
  retrying?: boolean;
  /** Custom empty node, or props for the default DataEmptyState. */
  empty?: ReactNode;
  /** Empty-state title when using the default empty node. */
  emptyTitle?: string;
  /** Empty-state body when using the default empty node. */
  emptyBody?: ReactNode;
  /** Override the emptiness check (default: `isEmpty` from data-empty-state). */
  isEmpty?: (data: T) => boolean;
  /** Render compact variants of the error/empty states. */
  compact?: boolean;
}

export function AsyncData<T>({
  query,
  children,
  loading,
  onRetry,
  retrying,
  empty,
  emptyTitle = "Nothing here yet",
  emptyBody,
  isEmpty,
  compact = false,
}: AsyncDataProps<T>) {
  // Error branch wins (a stale-data-with-error case still surfaces the error).
  if (query.error) {
    return (
      <DataLoadError
        message={toUserMessage(query.error)}
        variant={classifyError(query.error)}
        onRetry={onRetry}
        retrying={retrying}
        compact={compact}
      />
    );
  }

  if (query.isLoading || query.data === undefined) {
    return <>{loading ?? <Skeleton className="h-24 w-full rounded-2xl" />}</>;
  }

  const emptyCheck = isEmpty ?? defaultIsEmpty;
  if (emptyCheck(query.data)) {
    if (empty !== undefined) return <>{empty}</>;
    return (
      <DataEmptyState title={emptyTitle} body={emptyBody} compact={compact} />
    );
  }

  return <>{children(query.data)}</>;
}
