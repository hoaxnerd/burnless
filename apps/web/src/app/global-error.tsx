"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", backgroundColor: "#fafafa" }}>
          <div style={{ borderRadius: "16px", backgroundColor: "#fff", border: "1px solid #e5e5e5", padding: "48px", textAlign: "center", maxWidth: "400px" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Something went wrong</h3>
            <p style={{ fontSize: "14px", color: "#737373", marginBottom: "24px" }}>
              We hit an unexpected error. Please try refreshing the page.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                onClick={reset}
                style={{ borderRadius: "12px", backgroundColor: "#6366f1", padding: "10px 20px", fontSize: "14px", fontWeight: 600, color: "#fff", border: "none", cursor: "pointer" }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{ borderRadius: "12px", backgroundColor: "#f5f5f5", padding: "10px 20px", fontSize: "14px", fontWeight: 600, color: "#404040", textDecoration: "none" }}
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
