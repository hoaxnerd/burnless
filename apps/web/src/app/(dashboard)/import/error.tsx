"use client";

import PageErrorBoundary from "@/components/page-error-boundary";

export default function ImportPageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageErrorBoundary error={error} reset={reset} pageName="Import" />;
}
